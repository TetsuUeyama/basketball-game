/**
 * Footwork — フットワーク (ピボット / ジャンプストップ / ストライドストップ / ドロップステップ)
 *
 * リサーチ根拠:
 *  - ピボット (フロント/リバース) は片足をピボットフットとして固定
 *  - ジャンプストップ: 両足同時着地 → どちらの足もピボットフットになれる
 *  - ストライドストップ: 1-2 で着地 → 最初の足がピボットフット (NBA ルール準拠)
 *  - ドロップステップ: ポストプレイヤーの軸足固定からの 1 歩
 *  - トラベリング判定: ピボットフットが地面から離れた状態でドリブル開始不可
 *
 * 各 Skill は「現在の状況でこのフットワークが適合する」適合度を返す。
 */

import type { Skill, SkillContext, SkillEvaluation } from "./SkillTypes";
import { registerSkill } from "./SkillRegistry";
import { dist2d } from "../Movement/MovementCore";

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** 現在の Actor 速度 (m/s) */
function actorSpeed(actor: { vx: number; vz: number }): number {
  return Math.sqrt(actor.vx * actor.vx + actor.vz * actor.vz);
}

// =========================================================================
// FrontPivot — 前足を軸にピボット
// =========================================================================

export const frontPivot: Skill = {
  id: 'footwork:frontPivot',
  category: 'footwork',
  displayName: 'Front Pivot',
  evaluate(ctx: SkillContext): SkillEvaluation {
    // 静止状態または減速時に発火
    const speed = actorSpeed(ctx.actor);
    if (speed > 1.0) return { triggerScore: 0 };
    const speedScore = clamp(1 - speed, 0, 1);
    // ゴール向きが必要なら facing を活用するイメージ
    return { triggerScore: speedScore * 0.6 };
  },
};

// =========================================================================
// ReversePivot — 後足を軸にピボット
// =========================================================================

export const reversePivot: Skill = {
  id: 'footwork:reversePivot',
  category: 'footwork',
  displayName: 'Reverse Pivot',
  evaluate(ctx: SkillContext): SkillEvaluation {
    const speed = actorSpeed(ctx.actor);
    if (speed > 1.0) return { triggerScore: 0 };
    const speedScore = clamp(1 - speed, 0, 1);
    // 背後を確認したいとき (近接 DF) でリバースピボット有効
    if (ctx.nearestDefender && ctx.nearestDefenderDist < 1.5) {
      return { triggerScore: speedScore * 0.8 };
    }
    return { triggerScore: speedScore * 0.4 };
  },
};

// =========================================================================
// JumpStop — 両足同時着地 (どちらもピボットフットになれる)
// =========================================================================

export const jumpStop: Skill = {
  id: 'footwork:jumpStop',
  category: 'footwork',
  displayName: 'Jump Stop',
  evaluate(ctx: SkillContext): SkillEvaluation {
    // 中-高速 (4-6 m/s) で止まる必要があるとき
    const speed = actorSpeed(ctx.actor);
    if (speed < 3.0 || speed > 7.0) return { triggerScore: 0 };
    const speedScore = 1 - Math.abs(speed - 5.0) / 2.0;
    // ペイント手前で止まりたいとき (ジャンプストップで両足軸を確保)
    const goalDist = dist2d(ctx.actor.x, ctx.actor.z, ctx.goalX, ctx.goalZ);
    const zoneScore = goalDist > 2.5 && goalDist < 5.0 ? 1.0 : 0.5;
    return { triggerScore: clamp(speedScore, 0, 1) * zoneScore };
  },
};

// =========================================================================
// StrideStop — 1-2 で着地 (NBA ルール、最初の足がピボット)
// =========================================================================

export const strideStop: Skill = {
  id: 'footwork:strideStop',
  category: 'footwork',
  displayName: 'Stride Stop',
  evaluate(ctx: SkillContext): SkillEvaluation {
    // 高速 (5+ m/s) で着地する必要があるとき
    const speed = actorSpeed(ctx.actor);
    if (speed < 4.0) return { triggerScore: 0 };
    const speedScore = clamp((speed - 4.0) / 3.0, 0, 1);
    // シュート姿勢に入れる距離
    const goalDist = dist2d(ctx.actor.x, ctx.actor.z, ctx.goalX, ctx.goalZ);
    const zoneScore = goalDist > 1.5 && goalDist < 5.0 ? 1.0 : 0.6;
    return { triggerScore: speedScore * zoneScore };
  },
};

// =========================================================================
// DropStep — ポストプレイヤーの軸足固定からリム方向へ 1 歩
// =========================================================================

export const dropStep: Skill = {
  id: 'footwork:dropStep',
  category: 'footwork',
  displayName: 'Drop Step',
  evaluate(ctx: SkillContext): SkillEvaluation {
    // ポストプレイヤー (身長 198cm+)
    if (ctx.actor.height < 198) return { triggerScore: 0 };
    const heightScore = clamp((ctx.actor.height - 198) / 22, 0, 1);
    // リム下 (1-3m) で発火
    const goalDist = dist2d(ctx.actor.x, ctx.actor.z, ctx.goalX, ctx.goalZ);
    if (goalDist < 1.0 || goalDist > 3.5) return { triggerScore: 0 };
    const zoneScore = 1 - Math.abs(goalDist - 2.0) / 1.5;
    // 背後に DF がいるとドロップステップで有利
    const backDfBonus = ctx.nearestDefender && ctx.nearestDefenderDist < 1.5 ? 1.0 : 0.5;
    return { triggerScore: heightScore * clamp(zoneScore, 0, 1) * backDfBonus };
  },
};

// =========================================================================
// 自動登録
// =========================================================================

export const ALL_FOOTWORK: Skill[] = [
  frontPivot,
  reversePivot,
  jumpStop,
  strideStop,
  dropStep,
];

for (const skill of ALL_FOOTWORK) {
  registerSkill(skill);
}
