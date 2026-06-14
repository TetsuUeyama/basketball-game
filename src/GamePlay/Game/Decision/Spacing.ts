/**
 * Spacing — オフェンスのフロアスペーシング評価
 *
 * リサーチ根拠 (NBA / 現代戦術):
 *  - 理想間隔 4.57-5.49m (15-18 ft): defender が help と recover を両立できない距離
 *  - フロアバランス: コートを 3 等分、同じ third に最大 2 選手まで
 *  - ドライブレーン確保: ボールハンドラーのリムへの直線経路を塞がない
 *  - キーゾーン活用: トップ / スロット / ウィング / コーナー / ハイポスト / ローポスト
 *
 * Sources:
 *  - https://hoopmentality.com/blogs/basketball/basketball-spacing-complete-guide
 *  - https://underdoghoops.com/the-science-of-spacing-in-modern-basketball/
 *  - https://www.breakthroughbasketball.com/offense/five-out-basketball-offense.html
 */

import { SIM_FIELD_Z_HALF } from "../Config/FieldConfig";

// =========================================================================
// 定数
// =========================================================================

/** 理想スペーシング最小 (m)。これ未満は混雑、defender の help が容易 */
export const IDEAL_SPACING_MIN = 4.57; // 15 ft
/** 理想スペーシング最大 (m)。これ以上は離れすぎでパスが通りにくい */
export const IDEAL_SPACING_MAX = 5.49; // 18 ft
/** 絶対許容最小 (m)。これ未満は重大な混雑ペナルティ */
export const SPACING_HARD_MIN = 2.5;
/** ドライブレーン幅の半分 (m)。ボール→ゴール線から ±この距離内は侵入禁止 */
export const DRIVE_LANE_HALF_WIDTH = 1.2;
/** ドライブレーン上にいる場合のペナルティ強度 */
export const DRIVE_LANE_PENALTY = 8.0;

// =========================================================================
// 個別スコア関数
// =========================================================================

function dist2d(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * 味方とのスペーシングスコア。
 *  - 理想範囲 (4.57-5.49m) に最も近い → 高スコア
 *  - 絶対最小 (2.5m) 未満は重大なペナルティ
 *  - 離れすぎても緩いペナルティ
 *
 * @returns -10 〜 +5 (高いほど良い)
 */
export function scoreTeammateSpacing(
  x: number,
  z: number,
  teammates: ReadonlyArray<{ x: number; z: number }>,
): number {
  if (teammates.length === 0) return 0;

  let score = 0;
  for (const m of teammates) {
    const d = dist2d(x, z, m.x, m.z);
    if (d < SPACING_HARD_MIN) {
      // 重大混雑: -3 per mate
      score -= (SPACING_HARD_MIN - d) * 4 + 3;
    } else if (d < IDEAL_SPACING_MIN) {
      // 理想最小未満: 線形ペナルティ -2 〜 0
      score -= ((IDEAL_SPACING_MIN - d) / (IDEAL_SPACING_MIN - SPACING_HARD_MIN)) * 2;
    } else if (d <= IDEAL_SPACING_MAX) {
      // 理想範囲: +1 ボーナス
      score += 1;
    } else {
      // 離れすぎ: 軽いペナルティ
      const excess = d - IDEAL_SPACING_MAX;
      score -= Math.min(1.0, excess * 0.15);
    }
  }
  return score;
}

/**
 * フロアバランススコア (コートを 3 等分、各 third に最大 2 選手)。
 *  - 同じ third に 3 人以上 → ペナルティ
 *  - 3 third すべてに散らばっている → ボーナス
 *
 * Z 軸でコートを分割: バック third / ミドル third / フロント third
 *
 * @returns -5 〜 +2
 */
export function scoreFloorBalance(
  x: number,
  z: number,
  allOffensePositions: ReadonlyArray<{ x: number; z: number }>,
  attackGoalZ: number,
): number {
  // 攻撃ゴール方向を「フロント third」、ハーフコート寄りを「ミドル third」、自陣を「バック third」
  // コート長 28.65m を 3 等分 → 各 third は 9.55m 幅
  const courtLength = SIM_FIELD_Z_HALF * 2;
  const thirdSize = courtLength / 3;
  // attackGoalZ 側を 0 とした正規化 z (offense 攻撃方向に +)
  const zSign: 1 | -1 = attackGoalZ > 0 ? 1 : -1;

  function thirdOf(zPos: number): number {
    // offense の進行方向で正規化: 0 = back (自陣)、courtLength = front (攻撃ゴール)
    const normalized = (zPos * zSign) + SIM_FIELD_Z_HALF;
    if (normalized < thirdSize) return 0; // back
    if (normalized < thirdSize * 2) return 1; // middle
    return 2; // front (攻撃ゴール側)
  }

  // 自分が属する third
  const myThird = thirdOf(z);

  // 各 third のカウント (自分を除く)
  const counts = [0, 0, 0];
  for (const p of allOffensePositions) {
    counts[thirdOf(p.z)]++;
  }

  // 自分を含めた場合の myThird のカウント
  const myThirdCount = counts[myThird] + 1;

  let score = 0;
  // 同じ third に 3 人以上 → ペナルティ
  if (myThirdCount >= 3) score -= (myThirdCount - 2) * 2;
  // 3 third すべてに最低 1 人 (自分含む) → ボーナス
  const allOccupied = (counts[0] + (myThird === 0 ? 1 : 0) >= 1)
                   && (counts[1] + (myThird === 1 ? 1 : 0) >= 1)
                   && (counts[2] + (myThird === 2 ? 1 : 0) >= 1);
  if (allOccupied) score += 1.0;

  return score;
}

/**
 * ドライブレーンクリアスコア。ボールハンドラーがゴールへドライブする直線上に
 * 自分がいないかを評価。レーン上にいるとペナルティ (-DRIVE_LANE_PENALTY)。
 *
 * @returns -8 〜 0
 */
export function scoreDriveLaneClear(
  x: number,
  z: number,
  ballHolder: { x: number; z: number },
  goalX: number,
  goalZ: number,
): number {
  const dx = goalX - ballHolder.x;
  const dz = goalZ - ballHolder.z;
  const goalDist = Math.sqrt(dx * dx + dz * dz);
  if (goalDist < 0.01) return 0;

  const nx = dx / goalDist;
  const nz = dz / goalDist;

  // ボール→ゴール線への射影
  const relX = x - ballHolder.x;
  const relZ = z - ballHolder.z;
  const proj = relX * nx + relZ * nz;

  // 射影が負 (ボール後方) or ゴール後 → レーン外
  if (proj < 0 || proj > goalDist) return 0;

  // レーンに対する垂直距離
  const perp = Math.abs(-nz * relX + nx * relZ);
  if (perp >= DRIVE_LANE_HALF_WIDTH) return 0;

  // レーン内: 垂直距離が近いほど大きいペナルティ
  const ratio = 1 - perp / DRIVE_LANE_HALF_WIDTH;
  return -DRIVE_LANE_PENALTY * ratio;
}

// =========================================================================
// 統合スコア
// =========================================================================

export interface SpacingScore {
  teammateSpacing: number;
  floorBalance: number;
  driveLaneClear: number;
  total: number;
}

export interface SpacingWeights {
  teammate: number;
  floorBalance: number;
  driveLane: number;
}

export const DEFAULT_SPACING_WEIGHTS: SpacingWeights = {
  teammate: 1.0,
  floorBalance: 1.5,
  driveLane: 1.0,
};

/**
 * 指定位置のスペーシング総合評価。
 * OpenSpaceFinder / ActionScorer.passReceiverPosition から参照する想定。
 */
export function scoreSpacing(
  x: number,
  z: number,
  teammates: ReadonlyArray<{ x: number; z: number }>,
  allOffensePositions: ReadonlyArray<{ x: number; z: number }>,
  ballHolder: { x: number; z: number },
  goalX: number,
  goalZ: number,
  weights: SpacingWeights = DEFAULT_SPACING_WEIGHTS,
): SpacingScore {
  const teammateSpacing = scoreTeammateSpacing(x, z, teammates);
  const floorBalance = scoreFloorBalance(x, z, allOffensePositions, goalZ);
  const driveLaneClear = scoreDriveLaneClear(x, z, ballHolder, goalX, goalZ);
  const total =
    teammateSpacing * weights.teammate +
    floorBalance * weights.floorBalance +
    driveLaneClear * weights.driveLane;
  return { teammateSpacing, floorBalance, driveLaneClear, total };
}
