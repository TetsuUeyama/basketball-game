/**
 * Cuts — オフボールカットの 5 種類
 *
 * V-cut: 後退してから急反転
 * L-cut: ペイント→外 (またはその逆)、L 字経路
 * Backdoor: DF が overplay/deny したら裏へ
 * Flare: スクリーン後にコーナー方向へ広がる
 * Shallow: 浅いカット (リプレイス用)
 *
 * リサーチ根拠:
 *  - breakthroughbasketball.com の 12 cuts ガイド
 *  - DF の overplay 判定でバックドアが発火
 */

import type { Skill, SkillContext, SkillEvaluation } from "./SkillTypes";
import { registerSkill } from "./SkillRegistry";
import { dist2d, normAngleDiff } from "../Movement/MovementCore";

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** DF が overplay/deny しているか (Actor とボール保持者の間に入っている) */
function defenderIsOverplaying(
  actor: { x: number; z: number },
  defender: { x: number; z: number; facing: number } | null,
  ballHolder: { x: number; z: number } | null,
): boolean {
  if (!defender || !ballHolder) return false;
  // 三角形 Actor-Ball-Defender で Defender が Actor 側にいるか
  const ax = actor.x;
  const az = actor.z;
  const bx = ballHolder.x;
  const bz = ballHolder.z;
  const dx = defender.x;
  const dz = defender.z;
  // Ball→Actor 方向ベクトル
  const baX = ax - bx;
  const baZ = az - bz;
  const baLen = Math.sqrt(baX * baX + baZ * baZ);
  if (baLen < 0.01) return false;
  // Ball→Defender 射影が Ball→Actor の 60% 以上なら overplay
  const projection = ((dx - bx) * baX + (dz - bz) * baZ) / baLen;
  if (projection < baLen * 0.4 || projection > baLen) return false;
  // 垂直距離が近い (Defender が Actor の進路上)
  const perpX = (dx - bx) - (projection / baLen) * baX;
  const perpZ = (dz - bz) - (projection / baLen) * baZ;
  const perpDist = Math.sqrt(perpX * perpX + perpZ * perpZ);
  return perpDist < 1.5;
}

// =========================================================================
// V-Cut — 後退→急反転で DF を振り切る
// =========================================================================

export const vCut: Skill = {
  id: 'cut:vCut',
  category: 'cut',
  displayName: 'V-Cut',
  evaluate(ctx: SkillContext): SkillEvaluation {
    if (!ctx.nearestDefender) return { triggerScore: 0.5 }; // フリー (DF いない)
    // DF と密着している (deny 気味)
    if (ctx.nearestDefenderDist < 0.5) return { triggerScore: 0.3 };
    if (ctx.nearestDefenderDist > 2.5) return { triggerScore: 0.6 }; // ゆるい
    // 1-2m で DF が動いていれば V カットで揺さぶる
    const distScore = 1 - Math.abs(ctx.nearestDefenderDist - 1.3) / 1.5;
    return { triggerScore: clamp(distScore, 0, 1) * 0.8 };
  },
};

// =========================================================================
// L-Cut — ペイント↔外、L 字経路でポジションチェンジ
// =========================================================================

export const lCut: Skill = {
  id: 'cut:lCut',
  category: 'cut',
  displayName: 'L-Cut',
  evaluate(ctx: SkillContext): SkillEvaluation {
    const goalDist = dist2d(ctx.actor.x, ctx.actor.z, ctx.goalX, ctx.goalZ);
    // ペイント手前 (3-5m) か遠めウィング (6-8m) で発火しやすい
    if (goalDist >= 3 && goalDist <= 5) return { triggerScore: 0.7 };
    if (goalDist >= 6 && goalDist <= 8) return { triggerScore: 0.5 };
    return { triggerScore: 0.2 };
  },
};

// =========================================================================
// Backdoor Cut — DF が overplay/deny したら裏へ抜ける
// =========================================================================

export const backdoorCut: Skill = {
  id: 'cut:backdoor',
  category: 'cut',
  displayName: 'Backdoor',
  evaluate(ctx: SkillContext): SkillEvaluation {
    // SkillContext には ballHolder が直接ないので、近似: DF の facing がゴール側でなく Actor 側を向いている
    if (!ctx.nearestDefender) return { triggerScore: 0 };
    // DF が Actor 方向を向いている (overplay/deny の典型姿勢)
    const dxA = ctx.actor.x - ctx.nearestDefender.x;
    const dzA = ctx.actor.z - ctx.nearestDefender.z;
    const dist = Math.sqrt(dxA * dxA + dzA * dzA);
    if (dist < 0.01 || dist > 2.5) return { triggerScore: 0 };
    const actorAngle = Math.atan2(dzA, dxA);
    const facingDiff = Math.abs(normAngleDiff(ctx.nearestDefender.facing, actorAngle));
    // DF facing が Actor 方向 (±45°) なら overplay 気味
    if (facingDiff > Math.PI / 4) return { triggerScore: 0 };
    return { triggerScore: clamp(1 - facingDiff / (Math.PI / 4), 0, 1) * 0.9 };
  },
};

// =========================================================================
// Flare Cut — スクリーン後にコーナー方向へ広がる
// =========================================================================

export const flareCut: Skill = {
  id: 'cut:flare',
  category: 'cut',
  displayName: 'Flare',
  evaluate(ctx: SkillContext): SkillEvaluation {
    // コーナーに近い位置で発火
    const cornerX = ctx.actor.x > 0 ? 7.0 : -7.0;
    const cornerZ = ctx.goalZ > 0 ? ctx.goalZ - 0.5 : ctx.goalZ + 0.5;
    const distToCorner = dist2d(ctx.actor.x, ctx.actor.z, cornerX, cornerZ);
    if (distToCorner > 4.0) return { triggerScore: 0 };
    const distScore = 1 - distToCorner / 4.0;
    // ゴール正面ではコーナー方向への広がりが効く
    const goalDist = dist2d(ctx.actor.x, ctx.actor.z, ctx.goalX, ctx.goalZ);
    if (goalDist < 4 || goalDist > 8) return { triggerScore: distScore * 0.3 };
    return { triggerScore: distScore * 0.7 };
  },
};

// =========================================================================
// Shallow Cut — 浅いカット (リプレイス用)
// =========================================================================

export const shallowCut: Skill = {
  id: 'cut:shallow',
  category: 'cut',
  displayName: 'Shallow',
  evaluate(ctx: SkillContext): SkillEvaluation {
    // ペリメーター上 (6-8m) で他の選手とスペーシング維持
    const goalDist = dist2d(ctx.actor.x, ctx.actor.z, ctx.goalX, ctx.goalZ);
    if (goalDist < 5 || goalDist > 9) return { triggerScore: 0 };
    // DF が遠ければリプレイス価値あり
    if (!ctx.nearestDefender) return { triggerScore: 0.5 };
    if (ctx.nearestDefenderDist > 2.5) return { triggerScore: 0.6 };
    return { triggerScore: 0.3 };
  },
};

// =========================================================================
// 自動登録
// =========================================================================

export const ALL_CUTS: Skill[] = [
  vCut,
  lCut,
  backdoorCut,
  flareCut,
  shallowCut,
];

for (const skill of ALL_CUTS) {
  registerSkill(skill);
}
