/**
 * PlayerAbility — 個性化: 能力値を意思決定に反映
 *
 * リサーチ根拠:
 *  - 同じシチュエーションでも、選手の能力値 (offense/defense/speed/IQ) で
 *    判断・実行結果が変わる
 *  - PlayerData.PlayerStats (0..99 想定) を係数化して各判断に適用
 *
 * SimMover に optional ability を追加し、未設定なら能力値中庸 (50) で動作。
 */

import type { PlayerStats } from "@/GamePlay/Data/Types/PlayerData";

/**
 * シミュレーション内で参照する選手能力 (PlayerStats の subset)。
 * SimMover に optional でアタッチ可能。
 */
export interface SimPlayerAbility {
  offense: number;      // 0..99 — シュート・ドリブル総合
  defense: number;      // 0..99 — マーク・スティール・ブロック
  speed: number;        // 0..99 — 最高速
  acceleration: number; // 0..99 — 第一歩
  jump: number;         // 0..99 — ジャンプ力
  shooting3p: number;   // 0..99 — 3P 確率
  shooting2p: number;   // 0..99 — 2P 確率
  freeThrow: number;    // 0..99 — FT 確率
  passing: number;      // 0..99 — パス精度
  iq: number;           // 0..99 — メンタル・判断
  rebounding: number;   // 0..99 — リバウンド
  stamina: number;      // 0..99 — 持久
}

/** デフォルト能力値 (50 = 平均) */
export const DEFAULT_ABILITY: SimPlayerAbility = {
  offense: 50, defense: 50, speed: 50, acceleration: 50,
  jump: 50, shooting3p: 50, shooting2p: 50, freeThrow: 78, // FT は NBA 平均寄り
  passing: 50, iq: 50, rebounding: 50, stamina: 50,
};

// =========================================================================
// PlayerStats → SimPlayerAbility 変換
// =========================================================================

/**
 * フル PlayerStats から SimPlayerAbility (シミュレーション用 subset) を抽出。
 * 値が欠けていれば 50 (中庸) を補う。
 */
export function fromPlayerStats(stats: Partial<PlayerStats>): SimPlayerAbility {
  return {
    offense:      stats.offense ?? 50,
    defense:      stats.defense ?? 50,
    speed:        stats.speed ?? 50,
    acceleration: stats.acceleration ?? 50,
    jump:         stats.jump ?? 50,
    shooting3p:   stats['3paccuracy'] ?? 50,
    shooting2p:   stats.shootccuracy ?? 50,
    freeThrow:    stats.freethrow ?? 78,
    passing:      stats.passaccuracy ?? 50,
    iq:           stats.mentality ?? 50,
    rebounding:   stats.power ?? 50, // 簡易: power をリバウンド能力に流用
    stamina:      stats.stamina ?? 50,
  };
}

// =========================================================================
// 能力値 → 倍率変換
// =========================================================================

/**
 * 能力値 (0..99) を倍率に変換。
 *  - 50 = 1.0 (中庸)
 *  - 100 = 1.5 (最高)
 *  - 0 = 0.5 (最低)
 * @param value 能力値
 * @param spread スプレッド係数 (デフォルト 0.5 → ±50%)
 */
export function abilityToMultiplier(value: number, spread: number = 0.5): number {
  const normalized = (value - 50) / 50; // -1..+1
  return 1.0 + normalized * spread;
}

/**
 * 能力値を確率変換 (0..1)。シュート成功率など。
 *  - 0 = 25%
 *  - 50 = 50%
 *  - 99 = 75%
 */
export function abilityToProbability(value: number, baseProb: number = 0.5, spread: number = 0.25): number {
  const normalized = (value - 50) / 50;
  return Math.max(0.01, Math.min(0.99, baseProb + normalized * spread));
}

// =========================================================================
// シュート成功率の補正
// =========================================================================

/**
 * シュート確率を能力値と距離から計算。
 *  - 2P 圏内: shooting2p ベース
 *  - 3P 圏内: shooting3p ベース
 *  - 距離が遠いほど低下
 */
export function computeShotProbability(
  ability: SimPlayerAbility,
  goalDistM: number,
  isThreePoint: boolean,
): number {
  const baseSkill = isThreePoint ? ability.shooting3p : ability.shooting2p;
  const baseProb = isThreePoint ? 0.36 : 0.50; // NBA 平均
  const skillFactor = abilityToProbability(baseSkill, baseProb, 0.18);
  // 距離補正
  const distancePenalty = isThreePoint
    ? Math.max(0, (goalDistM - 7.24) * 0.05)
    : Math.max(0, (goalDistM - 1.5) * 0.04);
  return Math.max(0.05, skillFactor - distancePenalty);
}

/**
 * FT 成功率を能力値から計算。
 */
export function computeFreeThrowProbability(ability: SimPlayerAbility): number {
  return abilityToProbability(ability.freeThrow, 0.78, 0.20);
}

// =========================================================================
// 動的能力 (疲労・コンディション)
// =========================================================================

/**
 * スタミナ低下に応じた能力減衰。
 * 疲労 0 → 1.0、疲労 100 → 0.7 (能力の 30% 減)。
 */
export function applyFatigue(baseMultiplier: number, fatigue: number, ability: SimPlayerAbility): number {
  const staminaFactor = abilityToMultiplier(ability.stamina, 0.3); // スタミナ高ければ疲労耐性
  const effectiveFatigue = Math.max(0, fatigue - (staminaFactor - 1.0) * 50);
  const decay = Math.min(0.3, effectiveFatigue / 100 * 0.3);
  return baseMultiplier * (1.0 - decay);
}
