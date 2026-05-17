/**
 * DefenseSchemes — チームディフェンススキーム
 *
 * リサーチ根拠:
 *  - Pack Line (basketballforcoaches.com): ヘルプが 16ft ラインで縮む
 *  - No Middle: 中央ドリブル禁止、サイドに追い込む
 *  - PnR Coverage: Drop / Hedge / Switch / Blitz / Ice / Weak
 *  - Zone: 2-3, 3-2, 1-3-1
 *  - ヘルプ・ザ・ヘルパー連鎖 (Pack Line)
 */

import type { Scheme, SchemeContext, SchemeResult, PlayerInstruction } from "./SchemeTypes";
import { getDefenseAbsIdx } from "./SchemeTypes";
import { registerScheme } from "./SchemeRegistry";

function mirrorZ(z: number, defendGoalZ: number): number {
  return defendGoalZ > 0 ? z : -z;
}

function dist2d(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// =========================================================================
// マンツーマンディフェンス (基本)
// =========================================================================

class ManToManScheme implements Scheme {
  readonly id = 'defense:man-to-man';
  readonly kind = 'defense' as const;
  readonly displayName = 'Man-to-Man';

  evaluateActivation(): number {
    // 基本ディフェンス (常時 0.5 として、他に高いスキームがなければ採用)
    return 0.5;
  }

  tick(ctx: SchemeContext): SchemeResult {
    const s = ctx.state;
    const offense = [s.launcher, ...s.targets];
    const instructions: PlayerInstruction[] = [];
    // 各 DF をマーク対象 (同 rel idx) の 1m 前 (ゴール側) に
    for (let oi = 0; oi < 5; oi++) {
      const o = offense[oi];
      const sign = s.attackGoalZ > 0 ? -1 : 1; // DF はオフェンスとゴールの間
      instructions.push({
        entityIdx: getDefenseAbsIdx(s, oi),
        dest: { x: o.x, z: o.z + sign * 1.0 },
        speedMult: 1.0, priority: 6,
        label: `m2m:mark-${oi}`,
      });
    }
    return { instructions, completed: false };
  }
}

export const manToMan = new ManToManScheme();

// =========================================================================
// Pack Line ディフェンス (16ft ラインで縮む)
// =========================================================================

class PackLineScheme implements Scheme {
  readonly id = 'defense:pack-line';
  readonly kind = 'defense' as const;
  readonly displayName = 'Pack Line';

  evaluateActivation(): number {
    return 0.55; // m2m より優先
  }

  tick(ctx: SchemeContext): SchemeResult {
    const s = ctx.state;
    const offense = [s.launcher, ...s.targets];
    const instructions: PlayerInstruction[] = [];
    const defendGoalZ = s.defendGoalZ;
    // ヘルプ全員が 16ft (≈4.88m) アーク内に縮む
    const PACK_LINE_RADIUS = 4.88;

    for (let oi = 0; oi < 5; oi++) {
      const o = offense[oi];
      // ボール保持者の DF は密着、それ以外は Pack Line 内側に
      const isOnBall = oi === s.onBallEntityIdx;
      if (isOnBall) {
        const sign = defendGoalZ > 0 ? 1 : -1;
        instructions.push({
          entityIdx: getDefenseAbsIdx(s, oi),
          dest: { x: o.x, z: o.z - sign * 0.8 },
          speedMult: 1.0, priority: 7,
          label: `packline:on-ball-${oi}`,
        });
      } else {
        // Pack Line: オフェンスとリムを結ぶ線上、リムから 4.88m
        const goalX = 0;
        const rimZ = defendGoalZ;
        const dx = o.x - goalX;
        const dz = o.z - rimZ;
        const d = Math.sqrt(dx * dx + dz * dz) || 1;
        const tx = goalX + (dx / d) * PACK_LINE_RADIUS * 0.9;
        const tz = rimZ + (dz / d) * PACK_LINE_RADIUS * 0.9;
        instructions.push({
          entityIdx: getDefenseAbsIdx(s, oi),
          dest: { x: tx, z: tz },
          speedMult: 0.9, priority: 6,
          label: `packline:help-${oi}`,
        });
      }
    }
    return { instructions, completed: false };
  }
}

export const packLine = new PackLineScheme();

// =========================================================================
// No Middle (中央ドリブル禁止、サイドに追い込む)
// =========================================================================

class NoMiddleScheme implements Scheme {
  readonly id = 'defense:no-middle';
  readonly kind = 'defense' as const;
  readonly displayName = 'No Middle';

  evaluateActivation(): number {
    return 0.45;
  }

  tick(ctx: SchemeContext): SchemeResult {
    const s = ctx.state;
    const offense = [s.launcher, ...s.targets];
    const instructions: PlayerInstruction[] = [];
    const defendGoalZ = s.defendGoalZ;
    // ボールハンドラーの DF はサイドへ追い込む位置取り
    const handler = offense[s.onBallEntityIdx];
    const sideSign = handler.x >= 0 ? 1 : -1;
    instructions.push({
      entityIdx: getDefenseAbsIdx(s, s.onBallEntityIdx),
      dest: { x: handler.x - sideSign * 0.5, z: handler.z + (defendGoalZ > 0 ? -0.8 : 0.8) },
      speedMult: 1.0, priority: 7,
      label: 'no-middle:on-ball',
    });
    // 他 DF はマーク
    for (let oi = 0; oi < 5; oi++) {
      if (oi === s.onBallEntityIdx) continue;
      const o = offense[oi];
      instructions.push({
        entityIdx: getDefenseAbsIdx(s, oi),
        dest: { x: o.x, z: o.z + (defendGoalZ > 0 ? -1.0 : 1.0) },
        speedMult: 0.9, priority: 5,
        label: `no-middle:mark-${oi}`,
      });
    }
    return { instructions, completed: false };
  }
}

export const noMiddle = new NoMiddleScheme();

// =========================================================================
// 2-3 Zone Defense
// =========================================================================

class Zone23Scheme implements Scheme {
  readonly id = 'defense:zone-2-3';
  readonly kind = 'defense' as const;
  readonly displayName = '2-3 Zone';

  evaluateActivation(): number {
    return 0.35; // m2m / Pack Line より低い (オプション)
  }

  tick(ctx: SchemeContext): SchemeResult {
    const s = ctx.state;
    const instructions: PlayerInstruction[] = [];
    const z = s.defendGoalZ;
    // 2-3 ゾーン: トップ 2 + ローポスト 3
    // (前列 2 人: 約 z = 自陣ハーフコート寄り、後列 3 人: リム周辺)
    const frontZ = mirrorZ(7.5, z);
    const backZ = mirrorZ(12.0, z);
    instructions.push({ entityIdx: getDefenseAbsIdx(s, 0), dest: { x: -2.0, z: frontZ }, speedMult: 0.9, priority: 6, label: 'zone23:front-l' });
    instructions.push({ entityIdx: getDefenseAbsIdx(s, 1), dest: { x: 2.0,  z: frontZ }, speedMult: 0.9, priority: 6, label: 'zone23:front-r' });
    instructions.push({ entityIdx: getDefenseAbsIdx(s, 2), dest: { x: -4.5, z: backZ },  speedMult: 0.9, priority: 6, label: 'zone23:back-l' });
    instructions.push({ entityIdx: getDefenseAbsIdx(s, 3), dest: { x: 0,    z: backZ },  speedMult: 0.9, priority: 6, label: 'zone23:back-c' });
    instructions.push({ entityIdx: getDefenseAbsIdx(s, 4), dest: { x: 4.5,  z: backZ },  speedMult: 0.9, priority: 6, label: 'zone23:back-r' });
    return { instructions, completed: false };
  }
}

export const zone23 = new Zone23Scheme();

// =========================================================================
// 3-2 Zone Defense
// =========================================================================

class Zone32Scheme implements Scheme {
  readonly id = 'defense:zone-3-2';
  readonly kind = 'defense' as const;
  readonly displayName = '3-2 Zone';

  evaluateActivation(): number {
    return 0.3;
  }

  tick(ctx: SchemeContext): SchemeResult {
    const s = ctx.state;
    const z = s.defendGoalZ;
    const frontZ = mirrorZ(7.0, z);
    const backZ = mirrorZ(11.0, z);
    const instructions: PlayerInstruction[] = [];
    instructions.push({ entityIdx: getDefenseAbsIdx(s, 0), dest: { x: -3.5, z: frontZ }, speedMult: 0.9, priority: 6, label: 'zone32:front-l' });
    instructions.push({ entityIdx: getDefenseAbsIdx(s, 1), dest: { x: 0,    z: frontZ }, speedMult: 0.9, priority: 6, label: 'zone32:front-c' });
    instructions.push({ entityIdx: getDefenseAbsIdx(s, 2), dest: { x: 3.5,  z: frontZ }, speedMult: 0.9, priority: 6, label: 'zone32:front-r' });
    instructions.push({ entityIdx: getDefenseAbsIdx(s, 3), dest: { x: -2.5, z: backZ },  speedMult: 0.9, priority: 6, label: 'zone32:back-l' });
    instructions.push({ entityIdx: getDefenseAbsIdx(s, 4), dest: { x: 2.5,  z: backZ },  speedMult: 0.9, priority: 6, label: 'zone32:back-r' });
    return { instructions, completed: false };
  }
}

export const zone32 = new Zone32Scheme();

// =========================================================================
// 1-3-1 Zone Defense
// =========================================================================

class Zone131Scheme implements Scheme {
  readonly id = 'defense:zone-1-3-1';
  readonly kind = 'defense' as const;
  readonly displayName = '1-3-1 Zone';

  evaluateActivation(): number {
    return 0.3;
  }

  tick(ctx: SchemeContext): SchemeResult {
    const s = ctx.state;
    const z = s.defendGoalZ;
    const topZ = mirrorZ(5.5, z);
    const midZ = mirrorZ(9.5, z);
    const baseZ = mirrorZ(13.5, z);
    const instructions: PlayerInstruction[] = [];
    instructions.push({ entityIdx: getDefenseAbsIdx(s, 0), dest: { x: 0,    z: topZ },  speedMult: 1.0, priority: 6, label: 'zone131:top' });
    instructions.push({ entityIdx: getDefenseAbsIdx(s, 1), dest: { x: -4.0, z: midZ },  speedMult: 0.9, priority: 6, label: 'zone131:wing-l' });
    instructions.push({ entityIdx: getDefenseAbsIdx(s, 2), dest: { x: 0,    z: midZ },  speedMult: 0.9, priority: 6, label: 'zone131:center' });
    instructions.push({ entityIdx: getDefenseAbsIdx(s, 3), dest: { x: 4.0,  z: midZ },  speedMult: 0.9, priority: 6, label: 'zone131:wing-r' });
    instructions.push({ entityIdx: getDefenseAbsIdx(s, 4), dest: { x: 0,    z: baseZ }, speedMult: 0.9, priority: 6, label: 'zone131:base' });
    return { instructions, completed: false };
  }
}

export const zone131 = new Zone131Scheme();

// =========================================================================
// PnR Coverage (Drop / Hedge / Switch / Blitz / Ice / Weak)
// =========================================================================

/**
 * PnR coverage は単独のシステムではなく、マンツーマン/Pack Line 中に
 * スクリーンが発生したときの「対応戦術」。
 * Phase H.3 では coverage 識別子 (string) を定数として提供し、
 * 実際の動的切替は将来配線。
 */
export type PnRCoverage = 'drop' | 'hedge' | 'switch' | 'blitz' | 'ice' | 'weak';

export const PNR_COVERAGE_LABELS: Record<PnRCoverage, string> = {
  'drop':   'Drop (deep, allow 3P)',
  'hedge':  'Hedge / Show (delay then recover)',
  'switch': 'Switch (immediate matchup swap)',
  'blitz':  'Blitz / Trap (double team)',
  'ice':    'Ice / Down (force to sideline)',
  'weak':   'Weak (force to weak side)',
};

// =========================================================================
// 自動登録
// =========================================================================

registerScheme(manToMan);
registerScheme(packLine);
registerScheme(noMiddle);
registerScheme(zone23);
registerScheme(zone32);
registerScheme(zone131);

export const ALL_DEFENSE_SCHEMES: Scheme[] = [
  manToMan, packLine, noMiddle, zone23, zone32, zone131,
];
