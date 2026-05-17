/**
 * Weights — ファジー判断基準の重み付け関数群
 *
 * リサーチ根拠:
 *  - 単一ルールではなく複数要素の加重和で意思決定
 *  - 距離 / 体重 / スピード / ファウル数 / 残時間 / スコア差 を加味
 *
 * 各関数は 0..1 の連続値を返す (シグモイド/ロジスティック風)。
 * ActionScorer / SkillSelector / DefenseAI から共通で参照される。
 */

function clamp(v: number, min: number = 0, max: number = 1): number {
  return v < min ? min : v > max ? max : v;
}

// =========================================================================
// 距離ベースの重み
// =========================================================================

/**
 * 距離が近いほど高スコア (脅威・密着の度合い)。
 * 0m = 1.0、`fallOffDist` で 0.5、無限遠で 0。
 */
export function weightByCloseness(distM: number, fallOffDist: number = 2.0): number {
  return 1.0 / (1.0 + distM / fallOffDist);
}

/**
 * 距離が遠いほど高スコア (オープン・スペース度)。
 * `idealDist` で最大、近すぎ/遠すぎで減衰。
 */
export function weightByIdealDistance(distM: number, idealDist: number, tolerance: number = 1.5): number {
  const diff = Math.abs(distM - idealDist);
  return clamp(1.0 - diff / tolerance);
}

/**
 * ゴールに近い側を優遇 (ペイント・リム圏内重視)。
 * `paintDist` (約 5.79m) 内で 1.0、3P ライン (7.24m) で約 0.4、遠で 0。
 */
export function weightByGoalProximity(goalDistM: number): number {
  if (goalDistM <= 1.0) return 1.0;        // リム下
  if (goalDistM <= 5.79) return 0.85 - (goalDistM - 1.0) * 0.05; // ペイント内
  if (goalDistM <= 7.24) return 0.6 - (goalDistM - 5.79) * 0.15; // ミッドレンジ
  if (goalDistM <= 9.0) return 0.4 - (goalDistM - 7.24) * 0.15;  // 3P レンジ
  return 0.05;                              // 遠距離
}

// =========================================================================
// 時間ベースの重み
// =========================================================================

/**
 * ショットクロック残り時間に応じた緊急度 (残り少 = 高)。
 */
export function weightByShotClockUrgency(remainingSec: number): number {
  if (remainingSec >= 18) return 0.0;
  if (remainingSec >= 12) return 0.2;
  if (remainingSec >= 8)  return 0.5;
  if (remainingSec >= 4)  return 0.8;
  return 1.0;
}

/**
 * ゲームクロック残り時間に応じた緊急度 (試合終盤で高)。
 */
export function weightByGameClockUrgency(remainingSec: number, periodLengthSec: number = 720): number {
  // 試合残り 2 分以下で急上昇
  if (remainingSec >= 120) return 0.0;
  if (remainingSec >= 60) return 0.3;
  if (remainingSec >= 24) return 0.6;
  return 1.0;
}

// =========================================================================
// 体格・能力ベースの重み
// =========================================================================

/**
 * 体重差に基づくフィジカル優位度 (重い方が有利な接触状況)。
 * @param ownWeight 自身の体重 (kg)
 * @param opponentWeight 相手の体重 (kg)
 * @returns -1..1 (正 = 自分が重い、負 = 相手が重い)
 */
export function weightByWeightAdvantage(ownWeight: number, opponentWeight: number): number {
  const diff = ownWeight - opponentWeight;
  return clamp(diff / 30, -1, 1);
}

/**
 * 身長差に基づくシュート/ブロック優位度。
 * @returns -1..1 (正 = 自分が高い)
 */
export function weightByHeightAdvantage(ownHeight: number, opponentHeight: number): number {
  return clamp((ownHeight - opponentHeight) / 20, -1, 1);
}

/**
 * スピード差に基づく走り勝ち度合い。
 * @returns -1..1
 */
export function weightBySpeedAdvantage(ownSpeed: number, opponentSpeed: number): number {
  return clamp((ownSpeed - opponentSpeed) / 30, -1, 1);
}

// =========================================================================
// ファウル / メンタル
// =========================================================================

/**
 * ファウル数に応じたディフェンスのアグレッシブネス低下。
 * 0 ファウル = 1.0、6 ファウル = 0 (退場)。
 */
export function weightByFoulCount(personalFouls: number, maxFouls: number = 6): number {
  if (personalFouls >= maxFouls) return 0.0;
  // 4-5 ファウルで急減 (退場リスク警戒)
  if (personalFouls >= 5) return 0.3;
  if (personalFouls >= 4) return 0.5;
  if (personalFouls >= 3) return 0.7;
  return 1.0;
}

/**
 * チームファウルがボーナス状況の場合、ディフェンスがコンタクトを控える。
 * @returns 0..1 (1 = 通常、0.5 = ボーナス時 = アグレッシブネス半減)
 */
export function weightByTeamBonus(teamFoulsThisPeriod: number, bonusThreshold: number = 5): number {
  return teamFoulsThisPeriod >= bonusThreshold ? 0.5 : 1.0;
}

// =========================================================================
// スコア状況
// =========================================================================

/**
 * 点差に応じた攻撃積極度。
 * 大差リード時はリスク回避、ビハインド時は積極的。
 * @param ownScore 自チームスコア
 * @param oppScore 相手チームスコア
 * @returns 0..1 (1 = 最大積極、0 = 最大保守)
 */
export function weightByScoreDiff(ownScore: number, oppScore: number): number {
  const diff = ownScore - oppScore;
  // リード +10 → 保守 (0.3)、ビハインド -10 → 積極 (0.9)
  if (diff >= 15) return 0.2;
  if (diff >= 10) return 0.35;
  if (diff >= 5)  return 0.5;
  if (diff >= -5) return 0.6;
  if (diff >= -10) return 0.8;
  return 0.95;
}

// =========================================================================
// 角度ベース
// =========================================================================

/**
 * 角度差に基づく "向き合っている度合い"。
 * @param facingA A の向き (radian)
 * @param facingB B の向き (radian)
 * @returns 1 = 完全反対 (向き合い)、0 = 同方向
 */
export function weightByOppositeFacing(facingA: number, facingB: number): number {
  let diff = facingA - facingB;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return clamp(Math.abs(diff) / Math.PI);
}

// =========================================================================
// 集約: 重み付けスコア
// =========================================================================

/**
 * 複数の重みを加重平均で集約。
 * @param entries 重みと重み係数のペア
 */
export function aggregateWeights(entries: { value: number; weight: number }[]): number {
  let total = 0;
  let weightSum = 0;
  for (const e of entries) {
    total += e.value * e.weight;
    weightSum += e.weight;
  }
  return weightSum > 0 ? total / weightSum : 0;
}
