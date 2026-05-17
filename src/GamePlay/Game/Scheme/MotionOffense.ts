/**
 * MotionOffense — 5-Out / 4-Out 1-In モーションオフェンス
 *
 * リサーチ根拠 (breakthroughbasketball.com / basketballforcoaches.com):
 *  5 ルール:
 *   1. デナイされたらバックドア
 *   2. アタック可能なら即攻め
 *   3. ボール受けたら必ずスクエアアップ
 *   4. すべての行動に目的を
 *   5. パス・カット・ドリブル後はサークルローテーションでフィル
 *
 * 5-Out スポット (NBA コートで 3P ライン後ろ):
 *   - 4 ウィング/トップ + 1 コーナー、または 2 コーナー + 2 ウィング + 1 トップ
 *
 * 4-Out 1-In スポット:
 *   - 4 アウト + 1 イン (ハイポストかローポスト)
 */

import type { Scheme, SchemeContext, SchemeResult, PlayerInstruction } from "./SchemeTypes";
import { getOffenseAbsIdx } from "./SchemeTypes";
import { registerScheme } from "./SchemeRegistry";
import { getFormationSpots, type FormationKind } from "../Court/RoleSpots";
import type { CourtSpot } from "../Court/CourtSpots";

// =========================================================================
// 共通ヘルパー
// =========================================================================

function dist2d(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * フォーメーションのスポットに対し Greedy 割当を行い、各選手への指示を返す。
 *  - ボール保持者には指示を出さない
 *  - 非保持者は最も近い空きスポットへフィル
 *
 * スポット定義は CourtSpots/RoleSpots に集約され、座標リテラルは存在しない。
 */
function assignSpotsToOffense(
  ctx: SchemeContext,
  formation: FormationKind,
): PlayerInstruction[] {
  const s = ctx.state;
  const players = [s.launcher, ...s.targets];
  const zSign = s.attackGoalZ > 0 ? 1 : -1;

  // フォーメーションの世界座標スポットを取得
  const worldSpots: CourtSpot[] = getFormationSpots(formation, zSign);

  // 各プレイヤーに最も近い未割当スポットを Greedy 割当
  const assigned: boolean[] = new Array(worldSpots.length).fill(false);
  const instructions: PlayerInstruction[] = [];

  const nonHolders: number[] = [];
  for (let i = 0; i < players.length; i++) {
    if (i !== s.onBallEntityIdx) nonHolders.push(i);
  }
  const allRelIdx = [s.onBallEntityIdx, ...nonHolders];

  for (const relIdx of allRelIdx) {
    const p = players[relIdx];
    let bestSpotIdx = -1;
    let bestDist = Infinity;
    for (let si = 0; si < worldSpots.length; si++) {
      if (assigned[si]) continue;
      const d = dist2d(p.x, p.z, worldSpots[si].x, worldSpots[si].z);
      if (d < bestDist) {
        bestDist = d;
        bestSpotIdx = si;
      }
    }
    if (bestSpotIdx >= 0) {
      assigned[bestSpotIdx] = true;
      instructions.push({
        entityIdx: getOffenseAbsIdx(s, relIdx),
        dest: { x: worldSpots[bestSpotIdx].x, z: worldSpots[bestSpotIdx].z },
        speedMult: relIdx === s.onBallEntityIdx ? 0.0 : 1.0,
        priority: relIdx === s.onBallEntityIdx ? 0 : 5,
        label: `motion-spot:${worldSpots[bestSpotIdx].label}`,
      });
    }
  }

  return instructions;
}

// =========================================================================
// 5-Out モーション
// =========================================================================

export const fiveOutMotion: Scheme = {
  id: 'offense:5-out-motion',
  kind: 'offense',
  displayName: '5-Out Motion',
  evaluateActivation(ctx: SchemeContext): number {
    // ショットクロック 12 秒以上、トランジション中でなく、セットアップ可能
    if (ctx.shotClockRemaining < 12) return 0;
    if (ctx.state.offenseInTransit.some(t => t)) return 0.4; // トランジット中は弱め
    return 0.7;
  },
  tick(ctx: SchemeContext): SchemeResult {
    const instructions = assignSpotsToOffense(ctx, 'five-out');
    return { instructions, completed: false };
  },
};

// =========================================================================
// 4-Out 1-In モーション
// =========================================================================

export const fourOutOneInMotion: Scheme = {
  id: 'offense:4-out-1-in-motion',
  kind: 'offense',
  displayName: '4-Out 1-In Motion',
  evaluateActivation(ctx: SchemeContext): number {
    if (ctx.shotClockRemaining < 12) return 0;
    // ポストプレイヤー (身長 200cm+) が在籍していれば適合
    const offense = [ctx.state.launcher, ...ctx.state.targets];
    const hasPost = offense.some(p => p.height >= 200);
    return hasPost ? 0.6 : 0.3;
  },
  tick(ctx: SchemeContext): SchemeResult {
    const instructions = assignSpotsToOffense(ctx, 'four-out-one-in');
    return { instructions, completed: false };
  },
};

// =========================================================================
// 自動登録
// =========================================================================

registerScheme(fiveOutMotion);
registerScheme(fourOutOneInMotion);

export const ALL_MOTION_SCHEMES: Scheme[] = [fiveOutMotion, fourOutOneInMotion];
