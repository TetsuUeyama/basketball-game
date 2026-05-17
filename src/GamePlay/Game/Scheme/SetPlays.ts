/**
 * SetPlays — セットプレー (PnR / Horns / Flex / DHO)
 *
 * リサーチ根拠:
 *  - High/Side/Drag/Spain/Twist PnR (coachesclipboard.net, bballplaybook.com)
 *  - Horns: 1-4 ハイ + 5 ロー + 2/3 コーナー (thehoopsgeek.com)
 *  - Flex: フレックススクリーン + ダウンスクリーン
 *  - DHO: Dribble Hand-Off
 *
 * 各セットは "phase" で進行管理。1 ポゼッション内で完結。
 */

import type { Scheme, SchemeContext, SchemeResult, PlayerInstruction } from "./SchemeTypes";
import { getOffenseAbsIdx } from "./SchemeTypes";
import { registerScheme } from "./SchemeRegistry";
import { getSpotByName, getRim, getHighPost } from "../Court/CourtSpots";
import { getFormationSpotNames } from "../Court/RoleSpots";

// =========================================================================
// 共通ヘルパー
// =========================================================================

function mirrorZ(z: number, attackGoalZ: number): number {
  return attackGoalZ > 0 ? z : -z;
}

function getZSign(attackGoalZ: number): 1 | -1 {
  return attackGoalZ > 0 ? 1 : -1;
}

function dist2d(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// =========================================================================
// High Pick & Roll (1-5 トップ PnR)
// =========================================================================

/**
 * High PnR の流れ:
 *  Phase 0: スクリーナー (C) が PG の前にスクリーン
 *  Phase 1: PG がスクリーンを使ってドライブ
 *  Phase 2: C がロール (ペイントへ)、SG/SF/PF がスペーシング維持
 */
class HighPickAndRollScheme implements Scheme {
  readonly id = 'offense:pnr-high';
  readonly kind = 'offense' as const;
  readonly displayName = 'High Pick & Roll';
  private phase = 0;
  private phaseTimer = 0;

  evaluateActivation(ctx: SchemeContext): number {
    // 中盤 (10-20s) で発火しやすい、トップエリアにハンドラーがいる
    const sc = ctx.shotClockRemaining;
    if (sc < 8 || sc > 22) return 0;
    // ハンドラーがトップ周辺 (z 5-8m)
    const handler = ctx.state.launcher;
    const handlerInTop = Math.abs(handler.x) < 4 && Math.abs(handler.z) < 9;
    if (!handlerInTop) return 0;
    // Motion (0.7) を上回るように 0.85
    return 0.85;
  }

  tick(ctx: SchemeContext): SchemeResult {
    const s = ctx.state;
    this.phaseTimer += 0.016;  // 仮想 dt (本来は ctx に dt を持たせるべき)
    const goalZ = s.attackGoalZ;
    const handler = s.launcher;
    const screener = s.targets[2]; // C (offense rel idx 3)
    const instructions: PlayerInstruction[] = [];

    if (this.phase === 0) {
      // C がハンドラーの前方 1.5m にスクリーンセット
      const handlerZ = handler.z;
      const screenZ = handlerZ + mirrorZ(1.5, goalZ);
      instructions.push({
        entityIdx: getOffenseAbsIdx(s, 3), // C
        dest: { x: handler.x, z: screenZ },
        speedMult: 1.0, priority: 8,
        label: 'pnr:setting-screen',
      });
      // 到達したら次フェーズ
      if (dist2d(screener.x, screener.z, handler.x, screenZ) < 0.5) {
        this.phase = 1;
        this.phaseTimer = 0;
      }
    } else if (this.phase === 1) {
      // ハンドラーがスクリーンを使ってドライブ (右側へ)
      const driveZ = handler.z + mirrorZ(4.0, goalZ);
      instructions.push({
        entityIdx: getOffenseAbsIdx(s, 0), // PG
        dest: { x: handler.x + 1.5, z: driveZ },
        speedMult: 1.2, priority: 8,
        label: 'pnr:driving',
      });
      // 同時に C がロール開始 (リムへ)
      const rim = getRim(getZSign(goalZ));
      instructions.push({
        entityIdx: getOffenseAbsIdx(s, 3),
        dest: { x: rim.x, z: rim.z * 0.95 }, // リム手前
        speedMult: 1.1, priority: 7,
        label: 'pnr:rolling-to-rim',
      });
      if (this.phaseTimer > 1.5) {
        this.phase = 2;
      }
    } else {
      // Phase 2: 完了、モーションに戻る
      return { instructions, completed: true };
    }

    return { instructions, completed: false };
  }

  reset(): void {
    this.phase = 0;
    this.phaseTimer = 0;
  }
}

export const highPickAndRoll = new HighPickAndRollScheme();

// =========================================================================
// Side Pick & Roll (1-5 ウィング PnR)
// =========================================================================

class SidePickAndRollScheme implements Scheme {
  readonly id = 'offense:pnr-side';
  readonly kind = 'offense' as const;
  readonly displayName = 'Side Pick & Roll';

  evaluateActivation(ctx: SchemeContext): number {
    const sc = ctx.shotClockRemaining;
    if (sc < 8 || sc > 22) return 0;
    // ハンドラーがウィング (|x| 4-6m)
    const handler = ctx.state.launcher;
    const handlerOnWing = Math.abs(handler.x) > 4 && Math.abs(handler.x) < 7;
    return handlerOnWing ? 0.8 : 0;
  }

  tick(ctx: SchemeContext): SchemeResult {
    const s = ctx.state;
    const goalZ = s.attackGoalZ;
    const handler = s.launcher;
    const instructions: PlayerInstruction[] = [];
    // ウィング側で C がスクリーンセット
    const sign = handler.x > 0 ? 1 : -1;
    instructions.push({
      entityIdx: getOffenseAbsIdx(s, 3), // C
      dest: { x: handler.x - sign * 0.5, z: handler.z + mirrorZ(1.2, goalZ) },
      speedMult: 1.0, priority: 8,
      label: 'side-pnr:screen',
    });
    return { instructions, completed: false };
  }
}

export const sidePickAndRoll = new SidePickAndRollScheme();

// =========================================================================
// Spain Pick & Roll (third player back-screens roller's defender)
// =========================================================================

class SpainPickAndRollScheme implements Scheme {
  readonly id = 'offense:pnr-spain';
  readonly kind = 'offense' as const;
  readonly displayName = 'Spain Pick & Roll';

  evaluateActivation(ctx: SchemeContext): number {
    const sc = ctx.shotClockRemaining;
    if (sc < 12 || sc > 22) return 0;
    // ポストプレイヤー在籍 + ハンドラーがトップ
    const hasPost = ctx.state.targets[2].height >= 200;
    const handler = ctx.state.launcher;
    const handlerInTop = Math.abs(handler.x) < 3;
    return hasPost && handlerInTop ? 0.5 : 0;
  }

  tick(ctx: SchemeContext): SchemeResult {
    const s = ctx.state;
    const goalZ = s.attackGoalZ;
    const handler = s.launcher;
    const instructions: PlayerInstruction[] = [];
    // C がハイスクリーン
    instructions.push({
      entityIdx: getOffenseAbsIdx(s, 3),
      dest: { x: handler.x, z: handler.z + mirrorZ(1.5, goalZ) },
      speedMult: 1.0, priority: 8,
      label: 'spain-pnr:screen',
    });
    // PF (target[3]) がロールする C のディフェンダーにバックスクリーン
    instructions.push({
      entityIdx: getOffenseAbsIdx(s, 4),
      dest: { x: 0, z: mirrorZ(10.0, goalZ) },
      speedMult: 1.0, priority: 7,
      label: 'spain-pnr:back-screen',
    });
    return { instructions, completed: false };
  }
}

export const spainPickAndRoll = new SpainPickAndRollScheme();

// =========================================================================
// Horns (1-4 ハイ + 5 ロー + 2/3 コーナー)
// =========================================================================

class HornsScheme implements Scheme {
  readonly id = 'offense:horns';
  readonly kind = 'offense' as const;
  readonly displayName = 'Horns';

  evaluateActivation(ctx: SchemeContext): number {
    const sc = ctx.shotClockRemaining;
    if (sc < 14 || sc > 24) return 0;
    return 0.5;
  }

  tick(ctx: SchemeContext): SchemeResult {
    const s = ctx.state;
    const zSign = getZSign(s.attackGoalZ);
    const instructions: PlayerInstruction[] = [];
    // Horns 形成: ロール → スポット名は RoleSpots.getFormationSpotNames で定義
    const spotNames = getFormationSpotNames('horns');
    for (let ri = 0; ri < 5; ri++) {
      const spot = getSpotByName(spotNames[ri], zSign);
      instructions.push({
        entityIdx: getOffenseAbsIdx(s, ri),
        dest: { x: spot.x, z: spot.z },
        speedMult: 1.0, priority: 6,
        label: `horns:${spot.label}`,
      });
    }
    return { instructions, completed: false };
  }
}

export const horns = new HornsScheme();

// =========================================================================
// Dribble Hand-Off (DHO)
// =========================================================================

class DribbleHandOffScheme implements Scheme {
  readonly id = 'offense:dho';
  readonly kind = 'offense' as const;
  readonly displayName = 'Dribble Hand-Off';

  evaluateActivation(ctx: SchemeContext): number {
    const sc = ctx.shotClockRemaining;
    if (sc < 8) return 0;
    return 0.4;
  }

  tick(ctx: SchemeContext): SchemeResult {
    const s = ctx.state;
    const goalZ = s.attackGoalZ;
    const handler = s.launcher;
    // SG (target[0]) が PG にハンドオフしに来る
    const instructions: PlayerInstruction[] = [];
    instructions.push({
      entityIdx: getOffenseAbsIdx(s, 1),
      dest: { x: handler.x + 1.0, z: handler.z + mirrorZ(0.5, goalZ) },
      speedMult: 1.1, priority: 7,
      label: 'dho:approach',
    });
    return { instructions, completed: false };
  }
}

export const dribbleHandOff = new DribbleHandOffScheme();

// =========================================================================
// Flex Offense (フレックススクリーン + ダウンスクリーン連携)
// =========================================================================

class FlexScheme implements Scheme {
  readonly id = 'offense:flex';
  readonly kind = 'offense' as const;
  readonly displayName = 'Flex';

  evaluateActivation(ctx: SchemeContext): number {
    const sc = ctx.shotClockRemaining;
    if (sc < 12 || sc > 22) return 0;
    return 0.45;
  }

  tick(ctx: SchemeContext): SchemeResult {
    const s = ctx.state;
    const zSign = getZSign(s.attackGoalZ);
    const instructions: PlayerInstruction[] = [];
    // フレックス形成: RoleSpots の 'flex' フォーメーション
    const spotNames = getFormationSpotNames('flex');
    for (let ri = 0; ri < 5; ri++) {
      const spot = getSpotByName(spotNames[ri], zSign);
      instructions.push({
        entityIdx: getOffenseAbsIdx(s, ri),
        dest: { x: spot.x, z: spot.z },
        speedMult: 1.0, priority: 6,
        label: `flex:${spot.label}`,
      });
    }
    return { instructions, completed: false };
  }
}

export const flex = new FlexScheme();

// =========================================================================
// 自動登録
// =========================================================================

registerScheme(highPickAndRoll);
registerScheme(sidePickAndRoll);
registerScheme(spainPickAndRoll);
registerScheme(horns);
registerScheme(dribbleHandOff);
registerScheme(flex);

export const ALL_SET_PLAYS: Scheme[] = [
  highPickAndRoll, sidePickAndRoll, spainPickAndRoll,
  horns, dribbleHandOff, flex,
];
