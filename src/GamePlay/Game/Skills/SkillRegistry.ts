/**
 * SkillRegistry — スキル登録 + 選択ロジック
 *
 * カテゴリごとに最高スコアのスキルを返す `selectBestSkill` を提供。
 */

import type { Skill, SkillCategory, SkillContext, SkillSelection } from "./SkillTypes";

const registry: Map<SkillCategory, Skill[]> = new Map();

export function registerSkill(skill: Skill): void {
  const list = registry.get(skill.category) ?? [];
  if (!list.some(s => s.id === skill.id)) {
    list.push(skill);
    registry.set(skill.category, list);
  }
}

export function getSkillsByCategory(category: SkillCategory): Skill[] {
  return registry.get(category) ?? [];
}

/**
 * 指定カテゴリで、現在のコンテキスト下で最も適合度の高いスキルを選ぶ。
 * 閾値 (minScore) 未満なら null。
 */
export function selectBestSkill(
  category: SkillCategory,
  ctx: SkillContext,
  minScore: number = 0.3,
): SkillSelection | null {
  const skills = getSkillsByCategory(category);
  let best: SkillSelection | null = null;
  for (const skill of skills) {
    const evaluation = skill.evaluate(ctx);
    if (evaluation.triggerScore < minScore) continue;
    if (!best || evaluation.triggerScore > best.score) {
      best = { skill, score: evaluation.triggerScore, params: evaluation.executionParams };
    }
  }
  return best;
}

export function clearRegistry(): void {
  registry.clear();
}

/** 登録済みスキルの全リスト (デバッグ用) */
export function getAllSkills(): Skill[] {
  const all: Skill[] = [];
  for (const list of registry.values()) {
    all.push(...list);
  }
  return all;
}
