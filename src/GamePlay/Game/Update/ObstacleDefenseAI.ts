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
  OBSTACLE_FULL_SPRINT_SPEED,
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

  // --- Phase 1.5: トランジション "behind the play" 判定 ---
  // Phase H.10: ボールホルダーが defender より自陣ゴール (offense の attackGoal) に近ければ
  //   defender は「置いて行かれている」状態。全力で自陣へ retreat する。
  const onBallMover = allOffense[state.onBallEntityIdx];
  const onBallToAttackGoal = dist2d(
    onBallMover.x, onBallMover.z,
    state.attackGoalX, state.attackGoalZ,
  );

  // --- Phase 2: 各DFの移動 ---
  for (let oi = 0; oi < OB_CONFIGS.length; oi++) {
    const cfg = OB_CONFIGS[oi];
    const ob = obstacles[oi];

    // 空中の障害物 → 慣性がある場合はtickJumpPhysicsが水平移動を処理、なければフォールバック
    if (isAirborne(ob)) {
      const obEntityIdx = state.defenseBase + oi;
      const blockAction = state.actionStates[obEntityIdx];
      if (blockAction?.type === 'block') {
        orientToward(ob, onBallMover.x, onBallMover.z, dt);
      }
      // momentum がない場合のみフォールバック（静止ジャンプ等）
      if (Math.abs(ob.momentumVx) < 0.01 && Math.abs(ob.momentumVz) < 0.01) {
        moveWithFacing(ob, cfg.idleSpeed * JUMP_HORIZONTAL_MULT, dt);
      }
      continue;
    }

    // Phase H.10 / H.10b / H.14: 全力ダッシュ リトリート判定
    //   trigger 条件 (いずれか満たせば retreat フラグを立てる):
    //     (A) behindThePlay: ボールホルダーの方が defender より自陣ゴールに近い
    //     (B) inWrongHalf:   defender が自陣の反対側 (前ポゼッションの攻撃側) にいる
    //   フラグが立っている間は spawn 位置 (INIT_OBSTACLES mirrored) まで全力ダッシュ。
    //   spawn に到達 (1m 以内) でフラグクリア → 通常 mark ロジックへ。
    const obToOwnGoal = dist2d(
      ob.x, ob.z,
      state.attackGoalX, state.attackGoalZ,
    );
    const behindThePlay = obToOwnGoal > onBallToAttackGoal + 1.0;
    const inWrongHalf = state.attackGoalZ * ob.z < -0.5;
    if (behindThePlay || inWrongHalf) {
      state.obRetreatingToSpawn[oi] = true;
    }
    if (state.obRetreatingToSpawn[oi]) {
      const spawn = INIT_OBSTACLES[oi];
      const destX = spawn.x;
      const destZ = spawn.z * state.zSign; // 自陣側に mirror
      const dx = destX - ob.x;
      const dz = destZ - ob.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 1.0) {
        // spawn まで全力ダッシュ継続 (ハーフコート越えても止まらない)
        setChaserVelocity(ob, destX, destZ, OBSTACLE_FULL_SPRINT_SPEED, cfg.hoverRadius, dt);
        moveKeepFacing(ob, OBSTACLE_FULL_SPRINT_SPEED, dt);
        ob.facing = Math.atan2(dz, dx);
        ob.torsoFacing = ob.facing;
        ob.neckFacing = Math.atan2(onBallMover.z - ob.z, onBallMover.x - ob.x);
        continue;
      }
      // spawn 到達 → フラグクリア、通常 mark ロジックへ
      state.obRetreatingToSpawn[oi] = false;
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

      // Phase H.10d: マークがまだ defender の自陣に入っていない時の待機
      //   wait 位置 = defender の spawn 位置 (ベースライン側ではなく散開済みエリア)
      //   旧実装 (mark*0.2 + own_basket*0.8) は自陣偏重で defender が奥に引っ込みすぎていた
      if (state.zSign === 1 ? markTarget.z < DEFENSE_ENGAGE_Z : markTarget.z > -DEFENSE_ENGAGE_Z) {
        const spawn = INIT_OBSTACLES[oi];
        const waitX = spawn.x;
        const waitZ = spawn.z * state.zSign;
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

    // --- マーク対象が defender 自陣未到達: spawn 位置で待機 ---
    // Phase H.10d: wait 先 = defender 個別の spawn (散開状態を維持)
    if (state.zSign === 1 ? effectiveTarget.z < DEFENSE_ENGAGE_Z : effectiveTarget.z > -DEFENSE_ENGAGE_Z) {
      const spawn = INIT_OBSTACLES[oi];
      const waitX = spawn.x;
      const waitZ = spawn.z * state.zSign;
      // マーク対象が自分よりゴールに近い → スプリントで戻る
      const obGoalDist = dist2d(ob.x, ob.z, state.attackGoalX, state.attackGoalZ);
      const tgtGoalDist = dist2d(effectiveTarget.x, effectiveTarget.z, state.attackGoalX, state.attackGoalZ);
      const beaten = obGoalDist > tgtGoalDist + BEATEN_GOAL_DIST_MARGIN;
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
