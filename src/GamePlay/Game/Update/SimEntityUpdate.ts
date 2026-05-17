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
import { updateScan } from "../Decision/ScanSystem";
import { canEntityMove, applyMoveAction } from "./SimActionManager";
import { OB_CONFIGS } from "../Decision/ObstacleRoleAssignment";
import { TARGET_RANDOM_SPEED } from "../Config/EntityConfig";
import { moveWithFacing } from "../Movement/MovementCore";
import { getLowPostLeft, getLowPostRight } from "../Court/CourtSpots";

// Re-export from ObstacleDefenseAI for backwards compatibility
export { computePushObstructions, updateObstacleMovements } from "./ObstacleDefenseAI";

/**
 * Phase H.5: dest 指示に従って移動する。応答距離 0.15m 未満なら停止。
 * @returns true if moved (false = within tolerance / idle)
 */
function applyDestMovement(
  mover: SimMover, dest: { x: number; z: number }, speedMult: number, dt: number,
): boolean {
  const dx = dest.x - mover.x;
  const dz = dest.z - mover.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 0.15) {
    mover.vx = 0; mover.vz = 0;
    return true;
  }
  const speed = TARGET_RANDOM_SPEED * Math.max(0.1, speedMult);
  mover.vx = (dx / d) * speed;
  mover.vz = (dz / d) * speed;
  moveWithFacing(mover, speed, dt);
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

    // Transit mode: move toward home position, skip role movement
    if (state.offenseInTransit[offRelIdx]) {
      const arrived = moveTransitToHome(targets[ti], offRelIdx, dt, state.zSign);
      if (arrived) state.offenseInTransit[offRelIdx] = false;
      applyMoveAction(state, absIdx, targets[ti], dt);
      continue;
    }

    // 移動前の位置を保存（プッシュ減衰用）
    const prevX = targets[ti].x;
    const prevZ = targets[ti].z;

    // Phase H.5/H.6: Scheme 指示 + Cut 状態 + OREB クラッシュで既存ロール移動を上書き
    const offRel = ti + 1; // offense rel idx
    const offAbs = state.offenseBase + offRel;
    let movedByOverride = false;

    // 優先 1: ショット飛行中 → C / PF はリム周辺へクラッシュ (OREB 準備)
    // ti=2 (C) → ローポスト左、ti=3 (PF) → ローポスト右 (RoleSpots 由来の名前付き定義)
    if (state.ballActive && !state.interceptPt && !state.looseBall && (ti === 2 || ti === 3)) {
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

    // 優先 3: トランジション or オフェンス scheme 指示 (閾値 priority ≥7 でセットプレーのみ)
    // ※ Motion Offense (priority 5-6) は Greedy 再評価でワープを誘発するため除外。
    //   既存ロール AI (findOpenSpaceInZone) がスペーシングを担当する。
    //   PnR / Spain / DHO (priority 7-8) のみ override 可。
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

    // 既存ロール移動 (override が無い場合)
    if (!movedByOverride) {
      const others = getOtherTargets(ti);
      switch (ti) {
        case 0: {
          const res = moveSecondHandler(
            targets[0], state.targetDests[0], state.targetReevalTimers[0],
            dt, launcher, obstacles, others, state.zSign,
          );
          state.targetDests[0] = res.dest;
          state.targetReevalTimers[0] = res.reevalTimer;
          break;
        }
        case 1:
          moveSlasher(targets[1], state.slasherState, dt, launcher, obstacles, others, state.zSign);
          break;
        case 2:
          moveScreener(targets[2], state.screenerState, dt, launcher, obstacles, others, state.zSign);
          break;
        case 3:
          moveDunker(targets[3], state.dunkerState, dt, launcher, obstacles, others, state.zSign);
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
