/**
 * SimEntityUpdate - ターゲット/障害物の移動とスキャン更新
 * ディフェンス関連は ObstacleDefenseAI.ts に委譲。
 */

import { Vector3 } from "@babylonjs/core";

import type { SimState, SimMover, SimBall } from "../Types/TrackingSimTypes";
import {
  turnNeckToward,
  turnTorsoToward,
  orientToward,
} from "../Movement/MovementCore";
// state.attackGoalX/Z は state.attackGoalX/Z 経由で動的取得
import {
  NECK_TURN_RATE, TORSO_TURN_RATE,
} from "../Config/BodyDynamicsConfig";
import {
  PUSH_SPEED_MULT, PUSH_HAND_REACH,
} from "../Config/DefenseConfig";
import {
  moveSecondHandler,
  moveSlasher,
  moveScreener,
  moveDunker,
  moveTransitToHome,
} from "../Movement/RoleMovement";
import { motionDashTo, motionSprintTo } from "../Movement/MotionLayer";
import { updateScan } from "../Decision/ScanSystem";
import { canEntityMove, applyMoveAction } from "./SimActionManager";
import { OB_CONFIGS } from "../Decision/ObstacleRoleAssignment";
import { getLowPostLeft, getLowPostRight } from "../Court/CourtSpots";
import { ROLE_ASSIGNMENTS, getMirroredRole } from "../Decision/OffenseRoleAssignment";
import { OFFENSE_FULL_SPRINT_SPEED } from "../Config/EntityConfig";
import { isInPaint } from "../Config/GoalConfig";

// Re-export from ObstacleDefenseAI for backwards compatibility
export { computePushObstructions, updateObstacleMovements } from "./ObstacleDefenseAI";

/**
 * Phase H.20: AI が指定した dest へ motion 層 (motionDashTo) で移動。
 * インバウンド受け手 / OREB クラッシュ / カット / scheme 指示の共通モーション。
 * @returns 常に true (移動を試みたという意味、到達判定は呼び出し側で別途)
 */
function applyDestMovement(
  mover: SimMover, dest: { x: number; z: number }, speedMult: number, dt: number,
): boolean {
  motionDashTo(mover, dest, speedMult, dt);
  return true;
}

/**
 * ターゲットのロール別移動を実行（重複除去）
 * @param skipIdx ball-active時に選択ターゲットをスキップする場合のインデックス（-1で全て実行）
 */
export function updateTargetRoleMovements(state: SimState, dt: number, skipIdx: number): void {
  const { launcher, targets, obstacles } = state;
  const getOtherTargets = (ti: number): SimMover[] =>
    targets.filter((_, i) => i !== ti);

  for (let ti = 0; ti < targets.length; ti++) {
    if (ti === skipIdx) continue;
    const offRelIdx = 1 + ti;      // オフェンス相対 (0=launcher, 1-4=targets)
    const absIdx = state.offenseBase + offRelIdx;  // actionStates 用の絶対インデックス
    if (!canEntityMove(state.actionStates, absIdx)) {
      applyMoveAction(state, absIdx, targets[ti], dt);
      continue;
    }

    // Phase H.16: transit ロジックは override の後に移動
    // (override = OREB クラッシュ / カット / scheme / インバウンド受け手)

    // 移動前の位置を保存（プッシュ減衰用）
    const prevX = targets[ti].x;
    const prevZ = targets[ti].z;

    // Phase H.5/H.6: Scheme 指示 + Cut 状態 + OREB クラッシュで既存ロール移動を上書き
    const offRel = ti + 1; // offense rel idx
    const offAbs = state.offenseBase + offRel;
    let movedByOverride = false;

    // 優先 -1 (Phase H.26): paint 3秒違反 emergency exit。
    //   paintTime > 1.5s なら他の全 override より優先で home へ全力 sprint。
    //   on-ball player はそもそも paintTime 蓄積しない (ViolationDetector で exempt) ので
    //   このブランチは off-ball player 専用。
    //   1.5s から 1.5s 残しで sprint 4.5m/s なら 6.75m 移動可能 → paint (5.79m深) 確実に脱出。
    const paintTimeForEmergency = state.violationState.paintTimePerOffense[offRel] ?? 0;
    if (paintTimeForEmergency > 1.5) {
      const baseRole = ROLE_ASSIGNMENTS.targets[ti];
      const role = getMirroredRole(baseRole, state.zSign);
      motionSprintTo(targets[ti], { x: role.homeX, z: role.homeZ }, OFFENSE_FULL_SPRINT_SPEED, dt);
      movedByOverride = true;
    }

    // 優先 0: インバウンド中 → 最寄りオフェンスがレシーブ位置へ
    // Phase H.9: インバウンダーから 4m 程度の court inside にレシーバーを配置
    if (state.inboundActive) {
      // インバウンダーを除いて最寄りの相対 idx を計算
      const inbounder = state.launcher; // relIdx=0 が inbounder
      const targetsDistsFromInbounder = state.targets.map(t => {
        const dx = t.x - inbounder.x;
        const dz = t.z - inbounder.z;
        return Math.sqrt(dx * dx + dz * dz);
      });
      // 最も近い target idx
      let nearestIdx = 0;
      let nearestDist = Infinity;
      for (let i = 0; i < targetsDistsFromInbounder.length; i++) {
        if (targetsDistsFromInbounder[i] < nearestDist) {
          nearestDist = targetsDistsFromInbounder[i];
          nearestIdx = i;
        }
      }
      if (ti === nearestIdx) {
        // Phase H.15: 符号修正
        // レシーブ位置: インバウンダーから court 中心方向に 4m 入った位置
        const zSign: 1 | -1 = state.attackGoalZ > 0 ? 1 : -1;
        // インバウンダーは -zSign 側のベースライン外 (例: zSign=-1 で z=+14.325)
        // レシーバーは court 中心方向 (zSign 方向) に 4m
        const inboundBaselineZ = -zSign * 14.325;
        const receiveZ = inboundBaselineZ + zSign * 4.0; // court 中心へ 4m
        const receiveX = 2.5;
        movedByOverride = applyDestMovement(targets[ti], { x: receiveX, z: receiveZ }, 1.3, dt);
      }
    }

    // 優先 1: ショット飛行中 → C / PF はリム周辺へクラッシュ (OREB 準備)
    // ti=2 (C) → ローポスト左、ti=3 (PF) → ローポスト右 (RoleSpots 由来の名前付き定義)
    if (!movedByOverride && state.ballActive && !state.interceptPt && !state.looseBall && (ti === 2 || ti === 3)) {
      const zSign: 1 | -1 = state.attackGoalZ > 0 ? 1 : -1;
      const crashSpot = ti === 2 ? getLowPostLeft(zSign) : getLowPostRight(zSign);
      movedByOverride = applyDestMovement(targets[ti], { x: crashSpot.x, z: crashSpot.z }, 1.4, dt);
    }

    // 優先 2: カット中
    if (!movedByOverride) {
      const cutState = state.cutStates[offRel];
      if (cutState && cutState.remainingTime > 0 && cutState.skillId !== '') {
        movedByOverride = applyDestMovement(targets[ti], cutState.dest, 1.3, dt);
      }
    }

    // 優先 3: Phase H.17 — transit mode (ターンオーバー後・ポゼッション切替後の全力ダッシュ)
    //   off-ball プレイヤーが offenseRank (1-5) で補正済の sprint (4.5 m/s × 0.80-1.00) で
    //   home position へ向かう。scheme override より優先 (sprint させたい意図のため)。
    //   rank 5 (PF) = 1.00x 速度・1.0m 厳格、rank 1 (PG) = 0.80x 速度・3.0m アバウト。
    if (!movedByOverride && state.offenseInTransit[offRelIdx]) {
      const arrived = moveTransitToHome(targets[ti], offRelIdx, dt, state.zSign);
      if (arrived) state.offenseInTransit[offRelIdx] = false;
      movedByOverride = true;
    }

    // 優先 4: トランジション or オフェンス scheme 指示 (transit が終わった後の set play)
    //   PnR / Spain / DHO (priority 7-8) のみ override 可。Motion (priority 5-6) は除外。
    if (!movedByOverride) {
      const transIns = state.schemeTransitionInstructions.find(i => i.entityIdx === offAbs && i.priority >= 7);
      if (transIns && transIns.dest) {
        movedByOverride = applyDestMovement(targets[ti], transIns.dest, transIns.speedMult, dt);
      } else {
        const offIns = state.schemeOffenseInstructions.find(i => i.entityIdx === offAbs && i.priority >= 7);
        if (offIns && offIns.dest) {
          movedByOverride = applyDestMovement(targets[ti], offIns.dest, offIns.speedMult, dt);
        }
      }
    }

    // 既存ロール移動 (override も transit も無い場合)
    if (!movedByOverride) {
      const others = getOtherTargets(ti);
      // Phase H.12: 3秒違反回避用の paint 蓄積時間を取得
      const paintTime = state.violationState.paintTimePerOffense[offRel] ?? 0;
      switch (ti) {
        case 0: {
          const res = moveSecondHandler(
            targets[0], state.targetDests[0], state.targetReevalTimers[0],
            dt, launcher, obstacles, others, state.zSign, paintTime,
          );
          state.targetDests[0] = res.dest;
          state.targetReevalTimers[0] = res.reevalTimer;
          break;
        }
        case 1:
          moveSlasher(targets[1], state.slasherState, dt, launcher, obstacles, others, state.zSign, paintTime);
          break;
        case 2:
          moveScreener(targets[2], state.screenerState, dt, launcher, obstacles, others, state.zSign, paintTime);
          break;
        case 3:
          moveDunker(targets[3], state.dunkerState, dt, launcher, obstacles, others, state.zSign, paintTime);
          break;
      }
    }

    // プッシュ妨害による速度減衰を適用
    const pushInfo = state.pushObstructions.find(p => p.targetEntityIdx === offRelIdx);
    if (pushInfo) {
      const ob = obstacles[pushInfo.obstacleIdx];
      const dx = targets[ti].x - ob.x;
      const dz = targets[ti].z - ob.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= PUSH_HAND_REACH) {
        // 変位を PUSH_SPEED_MULT で縮小
        const moveX = targets[ti].x - prevX;
        const moveZ = targets[ti].z - prevZ;
        targets[ti].x = prevX + moveX * PUSH_SPEED_MULT;
        targets[ti].z = prevZ + moveZ * PUSH_SPEED_MULT;
      }
    }

    applyMoveAction(state, absIdx, targets[ti], dt);
  }
}

/**
 * オフェンス側（launcher + targets）の torsoFacing + neckFacing を更新。
 * 下半身 → 上半身 → 首 の3段階回転階層。
 * - Launcher: パス時は選択ターゲット方向、それ以外はbody facing方向へ戻る
 * - Targets: キャッチ時 or ボール飛行中の選択ターゲットはボール方向、それ以外はfacing方向へ戻る
 */
export function updateOffenseTorsoNeckFacing(
  state: SimState, ballActive: boolean, ballPosition: Vector3 | null, dt: number,
): void {
  const { launcher, targets } = state;
  const neckDelta = NECK_TURN_RATE * dt;
  const torsoDelta = TORSO_TURN_RATE * dt;
  const allOffense: SimMover[] = [launcher, ...targets];

  // --- 全オフェンスエンティティ ---
  for (let ei = 0; ei < allOffense.length; ei++) {
    const mover = allOffense[ei];
    const action = state.actionStates[state.offenseBase + ei];
    const isChargeOrStartup = action.phase === 'charge' || action.phase === 'startup';
    const isActiveOrRecovery = action.phase === 'active' || action.phase === 'recovery';

    if (action.type === 'shoot' && isChargeOrStartup) {
      // シュート charge/startup 中: ゴール方向に全身回転（facing + torso + neck）
      orientToward(mover, state.attackGoalX, state.attackGoalZ, dt);
    } else if (action.type === 'pass' && isChargeOrStartup) {
      // パス charge/startup 中: レシーバー方向に全身回転
      const receiver = ei === 0
        ? targets[state.selectedReceiverEntityIdx - 1]
        : (state.selectedReceiverEntityIdx === 0 ? launcher : targets[state.selectedReceiverEntityIdx - 1]);
      orientToward(mover, receiver.x, receiver.z, dt);
    } else if (action.type === 'pass' && isActiveOrRecovery) {
      // パス active/recovery 中: torso+neck のみレシーバー方向
      const receiver = ei === 0
        ? targets[state.selectedReceiverEntityIdx - 1]
        : (state.selectedReceiverEntityIdx === 0 ? launcher : targets[state.selectedReceiverEntityIdx - 1]);
      const angle = Math.atan2(receiver.z - mover.z, receiver.x - mover.x);
      mover.torsoFacing = turnTorsoToward(mover.facing, mover.torsoFacing, angle, torsoDelta);
      mover.neckFacing = turnNeckToward(mover.torsoFacing, mover.neckFacing, angle, neckDelta);
    } else if (action.type === 'shoot' && isActiveOrRecovery) {
      // シュート active/recovery 中: torso+neck をゴール方向
      const angle = Math.atan2(state.attackGoalZ - mover.z, state.attackGoalX - mover.x);
      mover.torsoFacing = turnTorsoToward(mover.facing, mover.torsoFacing, angle, torsoDelta);
      mover.neckFacing = turnNeckToward(mover.torsoFacing, mover.neckFacing, angle, neckDelta);
    } else if (action.type === 'catch' && ballPosition) {
      // キャッチ中: ボール方向を見る
      const angle = Math.atan2(ballPosition.z - mover.z, ballPosition.x - mover.x);
      mover.torsoFacing = turnTorsoToward(mover.facing, mover.torsoFacing, angle, torsoDelta);
      mover.neckFacing = turnNeckToward(mover.torsoFacing, mover.neckFacing, angle, neckDelta);
    } else if (ballActive && ei === state.selectedReceiverEntityIdx && ballPosition) {
      // ボール飛行中の選択レシーバー: ボール方向を見る
      const angle = Math.atan2(ballPosition.z - mover.z, ballPosition.x - mover.x);
      mover.torsoFacing = turnTorsoToward(mover.facing, mover.torsoFacing, angle, torsoDelta);
      mover.neckFacing = turnNeckToward(mover.torsoFacing, mover.neckFacing, angle, neckDelta);
    } else if (ei === state.onBallEntityIdx && action.type === 'idle') {
      // オンボールでアイドル時: ゴール方向に全身回転（トリプルスレット姿勢）
      orientToward(mover, state.attackGoalX, state.attackGoalZ, dt);
    } else if (state.offenseInTransit[ei] && ei !== state.onBallEntityIdx) {
      // トランジット中のオフボール: オンボール選手の方向を見る
      const onBallMover = ei === 0 ? launcher : (state.onBallEntityIdx === 0 ? launcher : targets[state.onBallEntityIdx - 1]);
      if (onBallMover !== mover) {
        const angle = Math.atan2(onBallMover.z - mover.z, onBallMover.x - mover.x);
        mover.torsoFacing = turnTorsoToward(mover.facing, mover.torsoFacing, angle, torsoDelta);
        mover.neckFacing = turnNeckToward(mover.torsoFacing, mover.neckFacing, angle, neckDelta);
      }
    } else {
      // デフォルト: 体の向きに戻す
      mover.torsoFacing = turnTorsoToward(mover.facing, mover.torsoFacing, mover.facing, torsoDelta);
      mover.neckFacing = turnNeckToward(mover.torsoFacing, mover.neckFacing, mover.facing, neckDelta);
    }
  }
}

export function updateScans(state: SimState, ballActive: boolean, ballPosition: Vector3, dt: number): void {
  const { launcher, targets, obstacles } = state;
  const scanBallPos = ballActive ? ballPosition : Vector3.Zero();
  const simBall: SimBall = {
    active: ballActive,
    x: scanBallPos.x, z: scanBallPos.z,
    vx: 0, vz: 0, age: state.ballAge,
  };
  for (let oi = 0; oi < OB_CONFIGS.length; oi++) {
    const cfg = OB_CONFIGS[oi];
    if (!cfg.scanEnabled) continue;
    // オンボールマーカーはスキャンスキップ（facing は movement で制御）
    if (cfg.markTargetEntityIdx === state.onBallEntityIdx) continue;
    const watchTarget = targets[cfg.scanWatchTargetIdx];
    const result = updateScan(
      obstacles[oi], state.obScanAtLauncher[oi], state.obScanTimers[oi],
      state.obFocusDists[oi], state.obReacting[oi], state.obMems[oi],
      watchTarget, launcher, simBall, dt,
    );
    state.obScanAtLauncher[oi] = result.atLauncher;
    state.obScanTimers[oi] = result.timer;
    state.obFocusDists[oi] = result.focusDist;
  }
}
