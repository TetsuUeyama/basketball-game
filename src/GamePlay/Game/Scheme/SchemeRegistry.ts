/**
 * SchemeRegistry — スキーム登録 + 選択ロジック
 *
 * オフェンス・ディフェンス・トランジションのスキームをカテゴリ別に管理。
 * 各カテゴリ内で `evaluateActivation` 値が最高のスキームを選ぶ。
 */

import type { Scheme, SchemeContext, SchemeKind } from "./SchemeTypes";

const registry: Map<SchemeKind, Scheme[]> = new Map();

export function registerScheme(scheme: Scheme): void {
  const list = registry.get(scheme.kind) ?? [];
  if (!list.some(s => s.id === scheme.id)) {
    list.push(scheme);
    registry.set(scheme.kind, list);
  }
}

export function getSchemesByKind(kind: SchemeKind): Scheme[] {
  return registry.get(kind) ?? [];
}

/**
 * 指定カテゴリで活性化値が最高のスキームを選ぶ。
 * @param minActivation 閾値 (デフォルト 0.3)
 */
export function selectActiveScheme(
  kind: SchemeKind,
  ctx: SchemeContext,
  minActivation: number = 0.3,
): Scheme | null {
  const schemes = getSchemesByKind(kind);
  let best: Scheme | null = null;
  let bestScore = minActivation;
  for (const scheme of schemes) {
    const score = scheme.evaluateActivation(ctx);
    if (score > bestScore) {
      best = scheme;
      bestScore = score;
    }
  }
  return best;
}

export function getAllSchemes(): Scheme[] {
  const all: Scheme[] = [];
  for (const list of registry.values()) {
    all.push(...list);
  }
  return all;
}

export function clearSchemeRegistry(): void {
  registry.clear();
}
