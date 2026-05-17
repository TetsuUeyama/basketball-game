/**
 * ObstacleDefenseAI - ディフェンス障害物のヘルプ割り当て・移動・プッシュ妨害
 * SimEntityUpdate.ts から抽出。
 */

import type { SimState, SimMover, PushObstructionInfo } from "../Types/TrackingSimTypes";
import {
  setChaserVelocity,
  moveKeepFacing,
  moveWithFacing,
  dist2d,
  orientToward,
} from "../Movement/MovementCore";
import {
  ONBALL_GOAL_DIST_FAR, ONBALL_GOAL_DIST_CLOSE,
  ONBALL_MARK_DIST_FAR, ONBALL_MARK_DIST_CLOSE,
  ONBALL_HOVER_FAR, ONBALL_HOVER_CLOSE,
  ONBALL_RECOVERY_DIST, ONBALL_PASS_CONTEST_DIST,
  OFFBALL_DENY_OFFSET,
  PUSH_ACTIVATION_DIST, PUSH_DENY_OFFSET, PUSH_DENY_HOVER,
  DEFENSE_ENGAGE_Z, DEFENSE_GOAL_OFFSET, SPRINT_TRIGGER_DIST,
  BEATEN_GOAL_DIST_MARGIN,
} from "../Config/DefenseConfig";
// state.attackGoalX/Z は state.attackGoalX/Z 経由で動的取得
import { OB_CONFIGS } from "../Decision/ObstacleRoleAssignment";
import { INIT_OBSTACLES } from "../Config/EntityConfig";
import { isAirborne } from "../Action/JumpPhysics";
import { JUMP_HORIZONTAL_MULT } from "../Config/JumpConfig";

/**
 * MAN_MARKER がターゲットに近接している場合のプッシュ妨害情報を計算する。
 * 条件: スキャン中でない、リアクション中でない、マーク対象がオンボールでない、
 *       距離が PUSH_ACTIVATION_DIST 以内。
 */
export function computePushObstructions(state: SimState): void {
  const result: PushObstructionInfo[] = [];
  const { launcher, targets, obstacles } = state;

  for (let oi = 0; oi < OB_CONFIGS.length; oi++) {
    const cfg = OB_CONFIGS[oi];
    // スキャン中でない
    if (state.obMems[oi].searching) continue;
    // リアクション中でない
    if (state.obReacting[oi]) continue;

    const markEntityIdx = cfg.markTargetEntityIdx;
    // マーク対象がオンボールでない（オンボール時はオンボールディフェンスで処理）
    if (markEntityIdx === state.onBallEntityIdx) continue;

    const ob = obstacles[oi];
    const markTarget = markEntityIdx === 0 ? launcher : targets[markEntityIdx - 1];
    const dx = markTarget.x - ob.x;
    const dz = markTarget.z - ob.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > PUSH_ACTIVATION_DIST) continue;

    // 腕の左右判定: ターゲットが facing 方向に対してどちら側か（外積で判定）
    const cross = Math.cos(ob.facing) * dz - Math.sin(ob.facing) * dx;
    const pushArm: 'left' | 'right' = cross >= 0 ? 'left' : 'right';

    result.push({
      obstacleIdx: oi,
      targetEntityIdx: markEntityIdx,
      pushArm,
      armTargetX: markTarget.x,
      armTargetZ: markTarget.z,
    });
  }

  state.pushObstructions = result;
}

/**
 * ヘルプディフェンス割り当てを計算する。
 *
 * 優先順位:
 * 1. オンボールDFが抜かれた → 最寄りのオフボールDFが進路を塞ぐ（最優先）
 * 2. フリーのオフボール選手 → 指定マーカーがスプリント or 最寄りDFがヘルプ
 *
 * @returns Map<obstacleIdx, helpTargetEntityIdx>
 */
export function computeHelpAssignments(
  state: SimState, allOffense: SimMover[],
): Map<number, number> {
  const { obstacles } = state;
  const result = new Map<number, number>();

  // =================================================================
  // ヘルプ発動条件: オンボールDFが抜かれた場合のみ
  // オフボールDFは基本的に自分のマークを離れない（マークフリー防止が最優先）
  // =================================================================
  const onBallMover = allOffense[state.onBallEntityIdx];
  const onBallDefOi = OB_CONFIGS.findIndex(c => c.markTargetEntityIdx === state.onBallEntityIdx);

  if (onBallDefOi >= 0 && !state.obReacting[onBallDefOi]) {
    const onBallDef = obstacles[onBallDefOi];
    const offGoalDist = dist2d(onBallMover.x, onBallMover.z, state.attackGoalX, state.attackGoalZ);
    const defGoalDist = dist2d(onBallDef.x, onBallDef.z, state.attackGoalX, state.attackGoalZ);

    if (defGoalDist > offGoalDist + BEATEN_GOAL_DIST_MARGIN) {
      // オンボールDFが抜かれた → ゴールに最も近いオフボールDFだけヘルプに回す
      const gd = offGoalDist || 1;
      const helpPosX = onBallMover.x + ((state.attackGoalX - onBallMover.x) / gd) * DEFENSE_GOAL_OFFSET;
      const helpPosZ = onBallMover.z + ((state.attackGoalZ - onBallMover.z) / gd) * DEFENSE_GOAL_OFFSET;

      let bestOi = -1;
      let bestDist = Infinity;
      for (let oi = 0; oi < OB_CONFIGS.length; oi++) {
        if (oi === onBallDefOi) continue;
        if (state.obReacting[oi]) continue;
        const d = dist2d(obstacles[oi].x, obstacles[oi].z, helpPosX, helpPosZ);
        if (d < bestDist) {
          bestDist = d;
          bestOi = oi;
        }
      }
      if (bestOi >= 0) {
        result.set(bestOi, state.onBallEntityIdx);

        // Phase H.8: ヘルプ・ザ・ヘルパー (2 段階ローテーション)
        // 一次ヘルパーの元マーク対象 → 別の DF が covering する
        const primaryHelperOrigMark = OB_CONFIGS[bestOi].markTargetEntityIdx;
        const origMarkMover = allOffense[primaryHelperOrigMark];
        let secondBestOi = -1;
        let secondBestDist = Infinity;
        for (let oi = 0; oi < OB_CONFIGS.length; oi++) {
          if (oi === onBallDefOi) continue;
          if (oi === bestOi) continue;
          if (state.obReacting[oi]) continue;
          if (result.has(oi)) continue;
          const d = dist2d(obstacles[oi].x, obstacles[oi].z, origMarkMover.x, origMarkMover.z);
          if (d < secondBestDist) {
            secondBestDist = d;
            secondBestOi = oi;
          }
        }
        if (secondBestOi >= 0) {
          result.set(secondBestOi, primaryHelperOrigMark);
        }
      }
    }
  }

  return result;
}

/**
 * 全5障害物の移動を統一処理（全MAN_MARKER）。
 *
 * 判断基準:
 * 1. 相手とゴールの間に入り直進させない（ゴールライン・ポジショニング）
 * 2. フリーの選手を作らない（ヘルプローテーション）
 * 3. フリーの相手がいたら全速力でマークに行く（スプリント）
 */
export function updateObstacleMovements(state: SimState, dt: number, passerMover: SimMover): void {
  const { launcher, targets, obstacles } = state;
  const allOffense: SimMover[] = [launcher, ...targets];

  // --- Phase 1: フリー選手検出 + ヘルプ割り当て ---
  const helpOverrides = computeHelpAssignments(state, allOffense);

  // --- Phase 2: 各DFの移動 ---
  for (let oi = 0; oi < OB_CONFIGS.length; oi++) {
    const cfg = OB_CONFIGS[oi];
    const ob = obstacles[oi];

    // 空中の障害物 → 慣性がある場合はtickJumpPhysicsが水平移動を処理、なければフォールバック
    if (isAirborne(ob)) {
      const obEntityIdx = state.defenseBase + oi;
      const blockAction = state.actionStates[obEntityIdx];
      if (blockAction?.type === 'block') {
        const onBallMover = allOffense[state.onBallEntityIdx];
        orientToward(ob, onBallMover.x, onBallMover.z, dt);
      }
      // momentum がない場合のみフォールバック（静止ジャンプ等）
      if (Math.abs(ob.momentumVx) < 0.01 && Math.abs(ob.momentumVz) < 0.01) {
        moveWithFacing(ob, cfg.idleSpeed * JUMP_HORIZONTAL_MULT, dt);
      }
      continue;
    }

    // リアクション中 → インターセプト移動（従来通り）
    if (state.obReacting[oi]) {
      moveWithFacing(ob, cfg.interceptSpeed, dt);
      continue;
    }

    const markEntityIdx = cfg.markTargetEntityIdx;
    const markTarget = allOffense[markEntityIdx];

    // --- オンボールディフェンス: ゴールライン・ポジショニング + 距離依存アグレッション ---
    // 相手とゴールを結んだ線上に立ち進路を妨害する。
    // ゴールに近いほど密着しスティールを狙う。遠いほど間合いを取り抜かれにくくする。
    // パス飛行中: レシーバーが近ければ追跡、遠ければポジション維持（手の deflection で対応）。
    if (markEntityIdx === state.onBallEntityIdx) {
      state.obMems[oi].searching = false;

      // エンゲージライン外: ボール保持者と自陣リムの中間で待機 (マークに追随)
      // Phase H.8: 旧実装は INIT_OBSTACLES 固定位置 → マークを放置していたため修正
      if (state.zSign === 1 ? markTarget.z < DEFENSE_ENGAGE_Z : markTarget.z > -DEFENSE_ENGAGE_Z) {
        const ownGoalX = 0;
        const ownGoalZ = state.defendGoalZ;
        const waitX = (markTarget.x + ownGoalX) / 2;
        const waitZ = (markTarget.z + ownGoalZ) / 2;
        // ボール保持者が自分よりゴールに近い → スプリントで戻る
        const obGD = dist2d(ob.x, ob.z, state.attackGoalX, state.attackGoalZ);
        const tgtGD = dist2d(markTarget.x, markTarget.z, state.attackGoalX, state.attackGoalZ);
        const beatenOnBall = obGD > tgtGD + BEATEN_GOAL_DIST_MARGIN;
        const farFromMark = dist2d(ob.x, ob.z, markTarget.x, markTarget.z) > 4.0;
        const waitSpd = (beatenOnBall || farFromMark) ? cfg.interceptSpeed : cfg.idleSpeed;
        setChaserVelocity(ob, waitX, waitZ, waitSpd, cfg.hoverRadius, dt);
        moveKeepFacing(ob, waitSpd, dt);
        orientToward(ob, markTarget.x, markTarget.z, dt);
        continue;
      }

      // パス飛行中: レシーバーが近くにいればそちらを追跡する
      if (state.ballActive && state.interceptPt) {
        const receiverMover = allOffense[state.selectedReceiverEntityIdx];
        const distToReceiver = dist2d(ob.x, ob.z, receiverMover.x, receiverMover.z);
        if (distToReceiver < ONBALL_PASS_CONTEST_DIST) {
          // レシーバーに向かってスプリントで追跡（キャッチ妨害）
          setChaserVelocity(ob, receiverMover.x, receiverMover.z, cfg.interceptSpeed, ONBALL_HOVER_CLOSE, dt);
          moveKeepFacing(ob, cfg.interceptSpeed, dt);
          orientToward(ob, receiverMover.x, receiverMover.z, dt);
        } else {
          // レシーバーが遠い → ポジション維持（手の deflection に任せる）
          setChaserVelocity(ob, ob.x, ob.z, cfg.idleSpeed, 0.5, dt);
          moveKeepFacing(ob, cfg.idleSpeed, dt);
          orientToward(ob, receiverMover.x, receiverMover.z, dt);
        }
        continue;
      }

      // 相手→ゴール方向を算出
      const toGoalX = state.attackGoalX - markTarget.x;
      const toGoalZ = state.attackGoalZ - markTarget.z;
      const goalDist = Math.sqrt(toGoalX * toGoalX + toGoalZ * toGoalZ);

      // ゴール距離に基づく 0-1 補間 (0=close, 1=far)
      const t = goalDist <= ONBALL_GOAL_DIST_CLOSE ? 0
        : goalDist >= ONBALL_GOAL_DIST_FAR ? 1
        : (goalDist - ONBALL_GOAL_DIST_CLOSE) / (ONBALL_GOAL_DIST_FAR - ONBALL_GOAL_DIST_CLOSE);

      const markDist = ONBALL_MARK_DIST_CLOSE + t * (ONBALL_MARK_DIST_FAR - ONBALL_MARK_DIST_CLOSE);
      let hoverR = ONBALL_HOVER_CLOSE + t * (ONBALL_HOVER_FAR - ONBALL_HOVER_CLOSE);

      // 速度: 近いほどインターセプト速度に近づく（密着プレッシャー）
      let speed = cfg.idleSpeed + (1 - t) * (cfg.interceptSpeed - cfg.idleSpeed);

      let markX: number, markZ: number;
      if (goalDist > 0.5) {
        markX = markTarget.x + (toGoalX / goalDist) * markDist;
        markZ = markTarget.z + (toGoalZ / goalDist) * markDist;
      } else {
        // ゴール直下: 相手の正面方向で塞ぐ
        markX = markTarget.x + Math.cos(markTarget.facing) * markDist;
        markZ = markTarget.z + Math.sin(markTarget.facing) * markDist;
      }

      // Fix 2: 理想位置からズレていたらダッシュで復帰（抜かれた時の対応）
      const distToMark = dist2d(ob.x, ob.z, markX, markZ);
      if (distToMark > ONBALL_RECOVERY_DIST) {
        speed = cfg.interceptSpeed;
        hoverR = ONBALL_HOVER_CLOSE;
      }

      setChaserVelocity(ob, markX, markZ, speed, hoverR, dt);
      moveKeepFacing(ob, speed, dt);
      orientToward(ob, markTarget.x, markTarget.z, dt);
      continue;
    }

    // --- ヘルプ割り当て確認 ---
    const helpEntityIdx = helpOverrides.get(oi);
    const isHelping = helpEntityIdx !== undefined;
    const effectiveTarget = isHelping ? allOffense[helpEntityIdx] : markTarget;

    // --- マーク対象がディフェンス自陣の奥深く: マークとリムの中間で待機 ---
    // Phase H.8: 旧実装は INIT_OBSTACLES (固定座標) で待機 → マーク対象から
    //   大きく離れた場所で "うろうろ" して見える原因だった。
    //   修正: 待機位置を「マークと自陣リムの中間」に動的計算することで、
    //   マーク対象が動けば待機位置も追随する。
    if (state.zSign === 1 ? effectiveTarget.z < DEFENSE_ENGAGE_Z : effectiveTarget.z > -DEFENSE_ENGAGE_Z) {
      // 自陣リム位置 (defendGoalZ は state にあり)
      const ownGoalX = 0;
      const ownGoalZ = state.defendGoalZ;
      // マークと自陣リムの中間に待機 (マーク追随しつつ自陣寄りに陣取る)
      const waitX = (effectiveTarget.x + ownGoalX) / 2;
      const waitZ = (effectiveTarget.z + ownGoalZ) / 2;
      // マーク対象が自分よりゴールに近い → スプリントで戻る
      const obGoalDist = dist2d(ob.x, ob.z, state.attackGoalX, state.attackGoalZ);
      const tgtGoalDist = dist2d(effectiveTarget.x, effectiveTarget.z, state.attackGoalX, state.attackGoalZ);
      const beaten = obGoalDist > tgtGoalDist + BEATEN_GOAL_DIST_MARGIN;
      // 実マークから 4m 以上離れていればスプリントで詰める
      const farFromMark = dist2d(ob.x, ob.z, effectiveTarget.x, effectiveTarget.z) > 4.0;
      const waitSpeed = (beaten || farFromMark) ? cfg.interceptSpeed : cfg.idleSpeed;
      setChaserVelocity(ob, waitX, waitZ, waitSpeed, cfg.hoverRadius, dt);
      moveKeepFacing(ob, waitSpeed, dt);
      orientToward(ob, effectiveTarget.x, effectiveTarget.z, dt);
      continue;
    }

    // --- オフボール: パスライン・ディナイ ---
    // マーク対象とパッサー（オンボールOF）の間に入り、パスコースを遮断する。
    const mem = state.obMems[oi];
    // Phase H.8: 実マーク位置から大きく乖離している場合は古いメモリを信頼せず実位置で chase
    //   (サーチ中でも実位置を採用 → DF がマーク放置で関係ない位置に居続けるバグを防ぐ)
    const distMemToReal = mem.searching
      ? dist2d(mem.lastSeenTargetX, mem.lastSeenTargetZ, effectiveTarget.x, effectiveTarget.z)
      : 0;
    const useMemory = mem.searching && !isHelping && distMemToReal < 2.0;
    const chaseX = isHelping ? effectiveTarget.x : (useMemory ? mem.lastSeenTargetX : effectiveTarget.x);
    const chaseZ = isHelping ? effectiveTarget.z : (useMemory ? mem.lastSeenTargetZ : effectiveTarget.z);
    // Phase H.8: メモリが乖離していたら強制更新 (古いキャッシュを最新位置で上書き)
    if (mem.searching && distMemToReal >= 2.0) {
      mem.lastSeenTargetX = effectiveTarget.x;
      mem.lastSeenTargetZ = effectiveTarget.z;
    }

    // パッサー方向: マーク対象からパッサーへのベクトル
    const pdx = passerMover.x - chaseX;
    const pdz = passerMover.z - chaseZ;
    const pDist = Math.sqrt(pdx * pdx + pdz * pdz);

    let defX: number, defZ: number;
    if (pDist > 0.5) {
      defX = chaseX + (pdx / pDist) * OFFBALL_DENY_OFFSET;
      defZ = chaseZ + (pdz / pDist) * OFFBALL_DENY_OFFSET;
    } else {
      defX = chaseX;
      defZ = chaseZ;
    }

    // 速度選択: ヘルプ中 or DF位置から遠い or マーク対象に抜かれている → スプリント
    // Phase H.8: 抜かれ判定は古いメモリではなく実際のマーク対象位置で判定する
    //   (サーチ中でも実位置基準で beaten 検知すれば追随漏れを防げる)
    const distToDefPos = dist2d(ob.x, ob.z, defX, defZ);
    const obGoalDist = dist2d(ob.x, ob.z, state.attackGoalX, state.attackGoalZ);
    const realTgtGoalDist = dist2d(effectiveTarget.x, effectiveTarget.z, state.attackGoalX, state.attackGoalZ);
    const beatenByMark = obGoalDist > realTgtGoalDist + BEATEN_GOAL_DIST_MARGIN;
    // Phase H.8: 実際のマーク対象から離れすぎている場合もスプリント (DF が置き去りにされた)
    const distToRealMark = dist2d(ob.x, ob.z, effectiveTarget.x, effectiveTarget.z);
    const farFromMark = distToRealMark > 3.0;
    const useSprint = isHelping || distToDefPos > SPRINT_TRIGGER_DIST || beatenByMark || farFromMark;
    const speed = useSprint ? cfg.interceptSpeed : cfg.idleSpeed;

    // 密着ディナイモード: マーク対象に近接 + サーチ中でない + ヘルプでない
    // → より小さいオフセットで密着し、プッシュ妨害可能な位置に立つ
    const distToTarget = dist2d(ob.x, ob.z, chaseX, chaseZ);
    if (!mem.searching && !isHelping && distToTarget < PUSH_ACTIVATION_DIST) {
      let denyX: number, denyZ: number;
      if (pDist > 0.01) {
        denyX = chaseX + (pdx / pDist) * PUSH_DENY_OFFSET;
        denyZ = chaseZ + (pdz / pDist) * PUSH_DENY_OFFSET;
      } else {
        denyX = chaseX;
        denyZ = chaseZ;
      }
      setChaserVelocity(ob, denyX, denyZ, speed, PUSH_DENY_HOVER, dt);
      moveKeepFacing(ob, speed, dt);
      orientToward(ob, effectiveTarget.x, effectiveTarget.z, dt);
    } else {
      // パスライン・ディナイ: マーク対象とパッサーの間へ移動
      setChaserVelocity(ob, defX, defZ, speed, cfg.hoverRadius, dt);
      moveKeepFacing(ob, speed, dt);
      orientToward(ob, chaseX, chaseZ, dt);
    }
  }
}
