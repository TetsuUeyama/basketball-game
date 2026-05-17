/**
 * FinishMoves — ペイント内のフィニッシュ技術
 *
 * 既存の dunk/layup/jumpshot に加え:
 *  - Floater: ペイント手前、長身ディフェンダー越し
 *  - ReverseLayup: ヘルプディフェンダーが追ってきたとき逆側で
 *  - HookShot: ポストプレイヤー、リムに背を向けた状態
 *
 * リサーチ根拠:
 *  - ユーロ vs フローター vs リバース の選択基準 (theworldofhoops.com)
 *  - ディフェンダー位置・身長・体勢で選ぶ
 */

import type { Skill, SkillContext, SkillEvaluation } from "./SkillTypes";
import { registerSkill } from "./SkillRegistry";
import { dist2d } from "../Movement/MovementCore";

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

// =========================================================================
// Floater — ペイント手前 (2.5-4m)、リム下に長身 DF がいるとき
// =========================================================================

export const floater: Skill = {
  id: 'finish:floater',
  category: 'finish',
  displayName: 'Floater',
  evaluate(ctx: SkillContext): SkillEvaluation {
    const goalDist = dist2d(ctx.actor.x, ctx.actor.z, ctx.goalX, ctx.goalZ);
    if (goalDist < 2.0 || goalDist > 4.5) return { triggerScore: 0 };
    const distScore = 1 - Math.abs(goalDist - 3.2) / 1.3;
    // ペイント内に長身 DF がいるかチェック
    if (!ctx.nearestDefender) return { triggerScore: distScore * 0.3 };
    const defGoalDist = dist2d(ctx.nearestDefender.x, ctx.nearestDefender.z, ctx.goalX, ctx.goalZ);
    // DF がリム下 (1.5m 以内) で身長 >190cm
    const isRimProtector = defGoalDist < 1.8 && ctx.nearestDefender.height >= 190;
    return { triggerScore: distScore * (isRimProtector ? 1.0 : 0.4) };
  },
};

// =========================================================================
// ReverseLayup — ヘルプ DF が追ってきたとき、リム反対側へ
// =========================================================================

export const reverseLayup: Skill = {
  id: 'finish:reverseLayup',
  category: 'finish',
  displayName: 'Reverse Layup',
  evaluate(ctx: SkillContext): SkillEvaluation {
    const goalDist = dist2d(ctx.actor.x, ctx.actor.z, ctx.goalX, ctx.goalZ);
    if (goalDist > 2.5) return { triggerScore: 0 };
    if (!ctx.nearestDefender) return { triggerScore: 0 };
    // DF が Actor とリムの間 (チェイス)
    const defGoalDist = dist2d(ctx.nearestDefender.x, ctx.nearestDefender.z, ctx.goalX, ctx.goalZ);
    const actorGoalDist = goalDist;
    // DF が Actor よりリムに近い (= ヘルプで先回り) なら逆側へ
    if (defGoalDist < actorGoalDist - 0.3) {
      return { triggerScore: 0.8 };
    }
    // DF が Actor と同じ側 (= チェイス) でも反対側フィニッシュが有効
    const dxA = ctx.goalX - ctx.actor.x;
    const dzA = ctx.goalZ - ctx.actor.z;
    const dxD = ctx.goalX - ctx.nearestDefender.x;
    const dzD = ctx.goalZ - ctx.nearestDefender.z;
    const sameSide = (dxA * dxD + dzA * dzD) > 0;
    return { triggerScore: sameSide ? 0.5 : 0 };
  },
};

// =========================================================================
// HookShot — ポストプレイヤー、リム背中向き
// =========================================================================

export const hookShot: Skill = {
  id: 'finish:hookShot',
  category: 'finish',
  displayName: 'Hook Shot',
  evaluate(ctx: SkillContext): SkillEvaluation {
    const goalDist = dist2d(ctx.actor.x, ctx.actor.z, ctx.goalX, ctx.goalZ);
    if (goalDist < 1.0 || goalDist > 4.0) return { triggerScore: 0 };
    // 身長 200cm 以上 (ポスト体型) が前提
    if (ctx.actor.height < 200) return { triggerScore: 0 };
    const heightScore = clamp((ctx.actor.height - 200) / 25, 0, 1);
    // リムに背を向けている (facing がゴールから 90° 以上反対)
    const dxG = ctx.goalX - ctx.actor.x;
    const dzG = ctx.goalZ - ctx.actor.z;
    const goalAngle = Math.atan2(dzG, dxG);
    const facingDiff = Math.abs(((ctx.actor.facing - goalAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const backToRim = facingDiff > Math.PI / 2 ? clamp((facingDiff - Math.PI / 2) / (Math.PI / 2), 0, 1) : 0;
    return { triggerScore: heightScore * backToRim };
  },
};

// =========================================================================
// 自動登録
// =========================================================================

export const ALL_FINISH_MOVES: Skill[] = [
  floater,
  reverseLayup,
  hookShot,
];

for (const skill of ALL_FINISH_MOVES) {
  registerSkill(skill);
}
