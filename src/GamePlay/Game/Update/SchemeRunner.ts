/**
 * SchemeRunner — Scheme と Skill を意思決定フローに統合
 *
 * Phase H.5: Phase H.2 (Skill) と H.3 (Scheme) を実際の動きに繁ぐ。
 *
 * 動作:
 *  1. 毎フレーム、TacticalMode に応じて active offensive/defensive scheme を選択
 *  2. scheme.tick() で各プレイヤーへの dest 指示を取得
 *  3. オフボールプレイヤーは scheme dest があれば追従、無ければ既存 RoleMovement
 *  4. オフボールプレイヤーは Skill (cut) も評価、トリガー検知でカット中状態に
 */

import type { SimState, SimMover } from "../Types/TrackingSimTypes";
import type { Scheme, SchemeContext, PlayerInstruction } from "../Scheme/SchemeTypes";
import { selectActiveScheme } from "../Scheme/SchemeRegistry";
import { selectBestSkill } from "../Skills/SkillRegistry";
import type { SkillContext } from "../Skills/SkillTypes";
import { TARGET_RANDOM_SPEED } from "../Config/EntityConfig";
import { moveWithFacing, dist2d } from "../Movement/MovementCore";

/** スキーム指示の最低 priority (これ未満は無視) */
const SCHEME_PRIORITY_THRESHOLD = 5;
/** Skill (cut) 発火の最低 score */
const SKILL_CUT_TRIGGER_THRESHOLD = 0.6;
/** カット中状態の持続時間 (秒) */
const CUT_STATE_DURATION = 1.5;

// =========================================================================
// 1 フレームのスキーム選択 + 実行 (instructions 生成)
// =========================================================================

export interface ActiveSchemes {
  offenseScheme: Scheme | null;
  offenseInstructions: PlayerInstruction[];
  defenseScheme: Scheme | null;
  defenseInstructions: PlayerInstruction[];
  /** transition モード時の override scheme */
  transitionScheme: Scheme | null;
  transitionInstructions: PlayerInstruction[];
}

/** 直前フレームの active scheme を記録 (再活性化時に reset するため) */
let _prevOffenseSchemeId: string | null = null;
let _prevTransitionSchemeId: string | null = null;
let _prevDefenseSchemeId: string | null = null;

/**
 * 毎フレーム呼び出し。TacticalMode に応じて active scheme を選び tick で指示生成。
 * スキーム切替時には新スキームの reset() を呼ぶ (phase ステート初期化のため)。
 */
export function runSchemes(
  state: SimState,
  simTime: number,
  shotClockRemaining: number,
): ActiveSchemes {
  const ctx: SchemeContext = {
    state,
    simTime,
    shotClockRemaining,
    possessionAge: simTime - state.possessionStartTime,
  };

  let offenseScheme: Scheme | null = null;
  let offenseInstructions: PlayerInstruction[] = [];
  let defenseScheme: Scheme | null = null;
  let defenseInstructions: PlayerInstruction[] = [];
  let transitionScheme: Scheme | null = null;
  let transitionInstructions: PlayerInstruction[] = [];

  // Transition モード or in-transit → トランジションスキーム優先
  const inTransit = state.offenseInTransit.some(t => t);
  if (inTransit || state.tacticalMode === 'transition') {
    transitionScheme = selectActiveScheme('transition', ctx, 0.3);
    if (transitionScheme) {
      if (transitionScheme.id !== _prevTransitionSchemeId && transitionScheme.reset) {
        transitionScheme.reset();
      }
      transitionInstructions = transitionScheme.tick(ctx).instructions;
    }
  }
  _prevTransitionSchemeId = transitionScheme?.id ?? null;

  // Team モード → モーション/セットプレー
  if (!transitionScheme && state.tacticalMode === 'team') {
    offenseScheme = selectActiveScheme('offense', ctx, 0.3);
    if (offenseScheme) {
      if (offenseScheme.id !== _prevOffenseSchemeId && offenseScheme.reset) {
        offenseScheme.reset();
      }
      offenseInstructions = offenseScheme.tick(ctx).instructions;
    }
  }
  _prevOffenseSchemeId = offenseScheme?.id ?? null;

  // Individual モード → スキーム指示なし (個人スキルに任せる)

  // ディフェンスは常時 active (Tactical Mode に依らない)
  defenseScheme = selectActiveScheme('defense', ctx, 0.3);
  if (defenseScheme) {
    if (defenseScheme.id !== _prevDefenseSchemeId && defenseScheme.reset) {
      defenseScheme.reset();
    }
    defenseInstructions = defenseScheme.tick(ctx).instructions;
  }
  _prevDefenseSchemeId = defenseScheme?.id ?? null;

  return {
    offenseScheme,
    offenseInstructions,
    defenseScheme,
    defenseInstructions,
    transitionScheme,
    transitionInstructions,
  };
}

// =========================================================================
// 指示の検索
// =========================================================================

/**
 * 指定プレイヤー (絶対 index) への指示を探す。
 * Transition > Offense > なし の優先順位。
 */
export function findInstructionForPlayer(
  schemes: ActiveSchemes,
  entityAbsIdx: number,
): PlayerInstruction | null {
  // Transition 優先
  for (const ins of schemes.transitionInstructions) {
    if (ins.entityIdx === entityAbsIdx && ins.priority >= SCHEME_PRIORITY_THRESHOLD) {
      return ins;
    }
  }
  for (const ins of schemes.offenseInstructions) {
    if (ins.entityIdx === entityAbsIdx && ins.priority >= SCHEME_PRIORITY_THRESHOLD) {
      return ins;
    }
  }
  return null;
}

export function findDefenseInstruction(
  schemes: ActiveSchemes,
  entityAbsIdx: number,
): PlayerInstruction | null {
  for (const ins of schemes.defenseInstructions) {
    if (ins.entityIdx === entityAbsIdx && ins.priority >= SCHEME_PRIORITY_THRESHOLD) {
      return ins;
    }
  }
  return null;
}

// =========================================================================
// 指示に従って移動
// =========================================================================

/**
 * dest 指示に向かって移動する。既存 moveWithFacing を使用。
 * @returns true if moved (false = idle)
 */
export function applyInstructionMovement(
  mover: SimMover,
  instruction: PlayerInstruction,
  dt: number,
): boolean {
  if (!instruction.dest) return false;
  const dx = instruction.dest.x - mover.x;
  const dz = instruction.dest.z - mover.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 0.15) {
    mover.vx = 0; mover.vz = 0;
    return false;
  }
  const speed = TARGET_RANDOM_SPEED * Math.max(0.1, instruction.speedMult);
  mover.vx = (dx / d) * speed;
  mover.vz = (dz / d) * speed;
  moveWithFacing(mover, speed, dt);
  return true;
}

// =========================================================================
// Skill (Cut) 評価
// =========================================================================

/**
 * オフボール選手に対してカットスキルを評価し、トリガーされたら一時的な dest を返す。
 * 既存の SLASHER V カットと衝突しないよう、別 trigger 条件のみ拾う (Backdoor / Flare)。
 */
export interface CutTrigger {
  skillId: string;
  dest: { x: number; z: number };
  /** カット持続時間 (秒) */
  duration: number;
}

export function evaluateCutForOffBall(
  actor: SimMover,
  state: SimState,
  simTime: number,
  shotClockRemaining: number,
): CutTrigger | null {
  // 最寄り DF を取得
  let nearestDef: SimMover | null = null;
  let nearestDefDist = Infinity;
  for (const ob of state.obstacles) {
    const d = dist2d(actor.x, actor.z, ob.x, ob.z);
    if (d < nearestDefDist) {
      nearestDefDist = d;
      nearestDef = ob;
    }
  }

  const ctx: SkillContext = {
    actor,
    nearestDefender: nearestDef,
    nearestDefenderDist: nearestDefDist,
    goalX: state.attackGoalX,
    goalZ: state.attackGoalZ,
    shotClockRemaining,
    simTime,
  };

  const best = selectBestSkill('cut', ctx, SKILL_CUT_TRIGGER_THRESHOLD);
  if (!best) return null;

  // バックドアトリガー時はリム方向にカット
  if (best.skill.id === 'cut:backdoor') {
    return {
      skillId: best.skill.id,
      dest: { x: 0, z: state.attackGoalZ * 0.85 }, // リム近く
      duration: CUT_STATE_DURATION,
    };
  }
  // Flare はコーナー方向
  if (best.skill.id === 'cut:flare') {
    const cornerX = actor.x >= 0 ? 6.5 : -6.5;
    return {
      skillId: best.skill.id,
      dest: { x: cornerX, z: state.attackGoalZ - (state.attackGoalZ > 0 ? 1.0 : -1.0) },
      duration: CUT_STATE_DURATION,
    };
  }
  // V-Cut, L-Cut, Shallow は既存ロジックに任せる (重複回避)
  return null;
}
