/**
 * Transition — トランジション (速攻 + 速攻ディフェンス)
 *
 * リサーチ根拠:
 *  - プライマリーブレイク 3 レーン (中央 + 両ウィング)
 *  - セカンダリーブレイク = アーリーオフェンス
 *  - 速攻ディフェンス: stop ball → sprint baseline → matchup
 *  - 「ボールが下 (ベースライン側) に行ったら最低 1 人下に」
 */

import type { Scheme, SchemeContext, SchemeResult, PlayerInstruction } from "./SchemeTypes";
import { getOffenseAbsIdx, getDefenseAbsIdx } from "./SchemeTypes";
import { registerScheme } from "./SchemeRegistry";

function mirrorZ(z: number, attackGoalZ: number): number {
  return attackGoalZ > 0 ? z : -z;
}

function dist2d(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// =========================================================================
// プライマリーブレイク (3 レーン)
// =========================================================================

class PrimaryBreakScheme implements Scheme {
  readonly id = 'transition:primary-break';
  readonly kind = 'transition' as const;
  readonly displayName = 'Primary Break (3-Lane)';

  evaluateActivation(ctx: SchemeContext): number {
    // トランジット中 (offenseInTransit) かつショットクロックが多 (まだ仕掛けられる)
    const inTransit = ctx.state.offenseInTransit.some(t => t);
    if (!inTransit) return 0;
    if (ctx.shotClockRemaining < 12) return 0;
    return 0.8; // モーション/セットプレーより優先
  }

  tick(ctx: SchemeContext): SchemeResult {
    const s = ctx.state;
    const goalZ = s.attackGoalZ;
    const instructions: PlayerInstruction[] = [];
    // 3 レーン (中央 + 右ウィング + 左ウィング)、後方 2 (トレイラー)
    // 中央レーン: PG (ボール保持者がフィルする想定)
    instructions.push({ entityIdx: getOffenseAbsIdx(s, 0), dest: { x: 0,    z: mirrorZ(11.0, goalZ) }, speedMult: 1.3, priority: 9, label: 'transition:lane-center' });
    instructions.push({ entityIdx: getOffenseAbsIdx(s, 1), dest: { x: 6.0,  z: mirrorZ(12.5, goalZ) }, speedMult: 1.3, priority: 9, label: 'transition:lane-right' });
    instructions.push({ entityIdx: getOffenseAbsIdx(s, 2), dest: { x: -6.0, z: mirrorZ(12.5, goalZ) }, speedMult: 1.3, priority: 9, label: 'transition:lane-left' });
    // トレイラー (PF, C): スリーポイントライン手前
    instructions.push({ entityIdx: getOffenseAbsIdx(s, 3), dest: { x: 2.0,  z: mirrorZ(7.0,  goalZ) }, speedMult: 1.1, priority: 7, label: 'transition:trailer-r' });
    instructions.push({ entityIdx: getOffenseAbsIdx(s, 4), dest: { x: -2.0, z: mirrorZ(7.0,  goalZ) }, speedMult: 1.1, priority: 7, label: 'transition:trailer-l' });
    return { instructions, completed: false };
  }
}

export const primaryBreak = new PrimaryBreakScheme();

// =========================================================================
// セカンダリーブレイク (アーリーオフェンス)
// =========================================================================

class SecondaryBreakScheme implements Scheme {
  readonly id = 'transition:secondary-break';
  readonly kind = 'transition' as const;
  readonly displayName = 'Secondary Break';

  evaluateActivation(ctx: SchemeContext): number {
    // プライマリーが失敗 (3-4 秒経過してもまだ仕掛けてない) → セカンダリー
    if (!ctx.state.offenseInTransit.some(t => t)) return 0;
    if (ctx.shotClockRemaining > 18 || ctx.shotClockRemaining < 14) return 0;
    return 0.6;
  }

  tick(ctx: SchemeContext): SchemeResult {
    const s = ctx.state;
    const goalZ = s.attackGoalZ;
    const instructions: PlayerInstruction[] = [];
    // フロアフロー: トップ + ウィング + コーナー + ポスト
    instructions.push({ entityIdx: getOffenseAbsIdx(s, 0), dest: { x: 0,    z: mirrorZ(6.0,  goalZ) }, speedMult: 1.0, priority: 6, label: 'secondary:top' });
    instructions.push({ entityIdx: getOffenseAbsIdx(s, 1), dest: { x: 5.5,  z: mirrorZ(8.5,  goalZ) }, speedMult: 1.0, priority: 6, label: 'secondary:wing-r' });
    instructions.push({ entityIdx: getOffenseAbsIdx(s, 2), dest: { x: -5.5, z: mirrorZ(8.5,  goalZ) }, speedMult: 1.0, priority: 6, label: 'secondary:wing-l' });
    instructions.push({ entityIdx: getOffenseAbsIdx(s, 3), dest: { x: 0,    z: mirrorZ(7.5,  goalZ) }, speedMult: 1.0, priority: 6, label: 'secondary:high-post' });
    instructions.push({ entityIdx: getOffenseAbsIdx(s, 4), dest: { x: 6.5,  z: mirrorZ(13.0, goalZ) }, speedMult: 1.0, priority: 6, label: 'secondary:corner-r' });
    return { instructions, completed: false };
  }
}

export const secondaryBreak = new SecondaryBreakScheme();

// =========================================================================
// トランジションディフェンス (stop ball → baseline → matchup)
// =========================================================================

class TransitionDefenseScheme implements Scheme {
  readonly id = 'transition:defense';
  readonly kind = 'transition' as const;
  readonly displayName = 'Transition Defense';

  evaluateActivation(ctx: SchemeContext): number {
    // 自軍がディフェンス側で、オフェンスが速攻中 (in transit)
    // (注: in-transit フラグはオフェンス側を示すため、ディフェンス側の sim では文脈が逆)
    // ここでは「相手の transition から守る」スキーム
    const offTransit = ctx.state.offenseInTransit.some(t => t);
    return offTransit ? 0.75 : 0;
  }

  tick(ctx: SchemeContext): SchemeResult {
    const s = ctx.state;
    const offense = [s.launcher, ...s.targets];
    const defendGoalZ = s.defendGoalZ;
    const instructions: PlayerInstruction[] = [];

    // 1. ボール保持者を最も近い DF が止める
    let stopperIdx = 0;
    let stopperDist = Infinity;
    const handler = offense[s.onBallEntityIdx];
    for (let di = 0; di < 5; di++) {
      const def = s.obstacles[di];
      const d = dist2d(def.x, def.z, handler.x, handler.z);
      if (d < stopperDist) {
        stopperDist = d;
        stopperIdx = di;
      }
    }
    instructions.push({
      entityIdx: getDefenseAbsIdx(s, stopperIdx),
      dest: { x: handler.x, z: handler.z + (defendGoalZ > 0 ? -1.0 : 1.0) },
      speedMult: 1.4, priority: 10,
      label: 'transd:stop-ball',
    });

    // 2. 残りの DF はベースライン (自陣リム下) へ全力スプリント
    let baselineCount = 0;
    for (let di = 0; di < 5; di++) {
      if (di === stopperIdx) continue;
      // 最低 1 人はリム下、残りは順次ファーマッチアップ
      let dest: { x: number; z: number };
      if (baselineCount === 0) {
        // 最初の 1 人はリム下
        dest = { x: 0, z: defendGoalZ };
      } else if (baselineCount === 1) {
        // 2 人目は FT ライン
        dest = { x: 0, z: defendGoalZ > 0 ? defendGoalZ - 5.8 : defendGoalZ + 5.8 };
      } else {
        // 3-4 人目はウィング
        const sign = baselineCount === 2 ? 1 : -1;
        dest = { x: sign * 5.0, z: defendGoalZ > 0 ? defendGoalZ - 3.0 : defendGoalZ + 3.0 };
      }
      instructions.push({
        entityIdx: getDefenseAbsIdx(s, di),
        dest, speedMult: 1.4, priority: 9,
        label: `transd:sprint-${baselineCount}`,
      });
      baselineCount++;
    }
    return { instructions, completed: false };
  }
}

export const transitionDefense = new TransitionDefenseScheme();

// =========================================================================
// 自動登録
// =========================================================================

registerScheme(primaryBreak);
registerScheme(secondaryBreak);
registerScheme(transitionDefense);

export const ALL_TRANSITION_SCHEMES: Scheme[] = [
  primaryBreak, secondaryBreak, transitionDefense,
];
