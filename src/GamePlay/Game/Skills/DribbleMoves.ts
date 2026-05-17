/**
 * DribbleMoves — オンボールのドリブルムーブライブラリ
 *
 * 6 種類のムーブ: Crossover / Hesitation / StepBack / InAndOut / Spin / Eurostep
 *
 * リサーチ根拠:
 *  - 各ムーブは「相手の体重バランス」を逆方向に乗せる原理 (breakthroughbasketball)
 *  - 発火条件は相手の facing / balance / 距離で決まる
 *
 * 各スキルは triggerScore で発火適合度 0..1 を返す。
 * SkillSelector が最高スコアのものを選択。
 */

import type { Skill, SkillContext, SkillEvaluation } from "./SkillTypes";
import { registerSkill } from "./SkillRegistry";
import { dist2d, normAngleDiff } from "../Movement/MovementCore";
import { isOffBalance } from "../Body/CenterOfMass";

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** ディフェンダーの移動方向が相手 (Actor) へ向かっているかの度合い (-1..1) */
function defenderApproachDot(actor: { x: number; z: number }, defender: { x: number; z: number; vx: number; vz: number }): number {
  const dx = actor.x - defender.x;
  const dz = actor.z - defender.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.01) return 0;
  const len = Math.sqrt(defender.vx * defender.vx + defender.vz * defender.vz);
  if (len < 0.01) return 0;
  return (defender.vx * dx + defender.vz * dz) / (dist * len);
}

/** ディフェンダーの体重偏り (comOffsetLateral) と Actor の相対位置から「片足体重か」を判定 */
function defenderLateralCommit(actor: { x: number; z: number }, defender: { x: number; z: number; comOffsetLateral: number; facing: number }): number {
  if (Math.abs(defender.comOffsetLateral) < 0.05) return 0;
  // ディフェンダーの体重が左右どちらに乗っているかを Actor 視点で評価
  const dx = actor.x - defender.x;
  const dz = actor.z - defender.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.01) return 0;
  // ディフェンダーの "右側" 方向ベクトル (facing の +90°)
  const rightX = Math.cos(defender.facing + Math.PI / 2);
  const rightZ = Math.sin(defender.facing + Math.PI / 2);
  // 体重偏り × Actor 方向との内積
  const sideDot = (dx / dist) * rightX + (dz / dist) * rightZ;
  return Math.abs(defender.comOffsetLateral) * (sideDot * Math.sign(defender.comOffsetLateral));
}

// =========================================================================
// Crossover — 相手の体重が片側に偏った瞬間、反対側へ抜く
// =========================================================================

export const crossover: Skill = {
  id: 'dribble:crossover',
  category: 'dribble',
  displayName: 'Crossover',
  evaluate(ctx: SkillContext): SkillEvaluation {
    const def = ctx.nearestDefender;
    if (!def) return { triggerScore: 0 };
    // 距離 1-2m がベスト (近すぎ・遠すぎは効かない)
    const distScore = ctx.nearestDefenderDist > 0.8 && ctx.nearestDefenderDist < 2.5
      ? 1 - Math.abs(ctx.nearestDefenderDist - 1.5) / 1.0
      : 0;
    // 相手が片足体重に乗っていれば発火しやすい
    const lateralCommit = defenderLateralCommit(ctx.actor, def);
    const balanceScore = isOffBalance(def.balance) ? 1.0 : clamp(lateralCommit * 5, 0, 1);
    return {
      triggerScore: distScore * (0.4 + 0.6 * balanceScore),
      executionParams: { direction: lateralCommit >= 0 ? 'right-to-left' : 'left-to-right' },
    };
  },
};

// =========================================================================
// Hesitation — 相手が下がり始めた瞬間、緩急で抜く
// =========================================================================

export const hesitation: Skill = {
  id: 'dribble:hesitation',
  category: 'dribble',
  displayName: 'Hesitation',
  evaluate(ctx: SkillContext): SkillEvaluation {
    const def = ctx.nearestDefender;
    if (!def) return { triggerScore: 0 };
    // 相手が後退中 (approach dot 負) なら発火
    const approach = defenderApproachDot(ctx.actor, def);
    const retreatScore = approach < -0.2 ? clamp(-approach, 0, 1) : 0;
    // 距離 1.5-3m
    const distScore = ctx.nearestDefenderDist > 1.0 && ctx.nearestDefenderDist < 3.5
      ? 1 - Math.abs(ctx.nearestDefenderDist - 2.2) / 1.5
      : 0;
    return { triggerScore: distScore * (0.3 + 0.7 * retreatScore) };
  },
};

// =========================================================================
// StepBack — 相手が前進してきた瞬間、後退してシュートスペース確保
// =========================================================================

export const stepBack: Skill = {
  id: 'dribble:stepBack',
  category: 'dribble',
  displayName: 'Step Back',
  evaluate(ctx: SkillContext): SkillEvaluation {
    const def = ctx.nearestDefender;
    if (!def) return { triggerScore: 0 };
    // 相手が前進中 (approach dot 正) なら発火
    const approach = defenderApproachDot(ctx.actor, def);
    const advanceScore = approach > 0.3 ? clamp(approach, 0, 1) : 0;
    // 距離 1-2m
    const distScore = ctx.nearestDefenderDist > 0.6 && ctx.nearestDefenderDist < 2.5
      ? 1 - Math.abs(ctx.nearestDefenderDist - 1.5) / 1.0
      : 0;
    // ショットレンジ内なら発火しやすい
    const goalDist = dist2d(ctx.actor.x, ctx.actor.z, ctx.goalX, ctx.goalZ);
    const rangeBonus = goalDist < 8.5 ? 1.0 : 0.3;
    return { triggerScore: distScore * advanceScore * rangeBonus };
  },
};

// =========================================================================
// InAndOut — 相手をハーフコミットさせて元の方向へ抜く
// =========================================================================

export const inAndOut: Skill = {
  id: 'dribble:inAndOut',
  category: 'dribble',
  displayName: 'In-and-Out',
  evaluate(ctx: SkillContext): SkillEvaluation {
    const def = ctx.nearestDefender;
    if (!def) return { triggerScore: 0 };
    // バランス安定 + ジョブステップで動かしやすい状況で発火
    const stableDef = def.balance > 0.7;
    if (!stableDef) return { triggerScore: 0 };
    // 距離 1.5-3m
    const distScore = ctx.nearestDefenderDist > 1.0 && ctx.nearestDefenderDist < 3.5
      ? 1 - Math.abs(ctx.nearestDefenderDist - 2.0) / 1.5
      : 0;
    return { triggerScore: distScore * 0.6 };
  },
};

// =========================================================================
// Spin — 相手が体を寄せたとき、反転して抜く
// =========================================================================

export const spinMove: Skill = {
  id: 'dribble:spin',
  category: 'dribble',
  displayName: 'Spin',
  evaluate(ctx: SkillContext): SkillEvaluation {
    const def = ctx.nearestDefender;
    if (!def) return { triggerScore: 0 };
    // 距離 0.5-1.5m (体接触圏)
    if (ctx.nearestDefenderDist < 0.4 || ctx.nearestDefenderDist > 1.8) return { triggerScore: 0 };
    const distScore = 1 - Math.abs(ctx.nearestDefenderDist - 1.0) / 0.8;
    // ペイント手前 (ゴール 3-5m) で最も効果的
    const goalDist = dist2d(ctx.actor.x, ctx.actor.z, ctx.goalX, ctx.goalZ);
    const zoneScore = goalDist > 2.5 && goalDist < 6.0 ? 1.0 : 0.4;
    return { triggerScore: distScore * zoneScore };
  },
};

// =========================================================================
// Eurostep — ペイント内、複数ディフェンダーをかわす
// =========================================================================

export const eurostep: Skill = {
  id: 'dribble:eurostep',
  category: 'dribble',
  displayName: 'Eurostep',
  evaluate(ctx: SkillContext): SkillEvaluation {
    // ペイント内 (ゴールから 4m 以内)
    const goalDist = dist2d(ctx.actor.x, ctx.actor.z, ctx.goalX, ctx.goalZ);
    if (goalDist > 4.5 || goalDist < 1.0) return { triggerScore: 0 };
    const zoneScore = 1 - Math.abs(goalDist - 2.5) / 2.0;
    // 最寄り DF との距離 (近すぎず、抜ける余地あり)
    if (!ctx.nearestDefender) return { triggerScore: zoneScore * 0.4 };
    if (ctx.nearestDefenderDist < 0.5) return { triggerScore: 0 }; // 密着しすぎ
    const distScore = clamp((ctx.nearestDefenderDist - 0.5) / 1.5, 0.3, 1.0);
    return { triggerScore: zoneScore * distScore };
  },
};

// =========================================================================
// 自動登録
// =========================================================================

export const ALL_DRIBBLE_MOVES: Skill[] = [
  crossover,
  hesitation,
  stepBack,
  inAndOut,
  spinMove,
  eurostep,
];

for (const skill of ALL_DRIBBLE_MOVES) {
  registerSkill(skill);
}
