/**
 * CenterOfMass — 重心 (Center of Mass) モデル
 *
 * リサーチ根拠:
 *  - 最適スタンス幅は 1.0–1.5× 腰幅 (Coach Dave Love)
 *  - COM Y は身長の約 55% (一般的な人体計測値)
 *  - COM は base of support (足跡の凸包) 内に収まれば安定
 *  - 加減速時に COM が前後に変位する (sprint = 前傾、stop = 後傾)
 *
 * ゲーム AI として再現する目的:
 *  - 体勢崩れ判定 (急停止 / 急方向転換が「効く」場面を検知)
 *  - クロスオーバー等のディフェンスムーブ発火条件 (相手の体重バランス)
 *  - リアルな加減速時間 (体勢が崩れていると次の動きが遅れる)
 */

import type { SimMover } from "../Types/TrackingSimTypes";

// =========================================================================
// 定数 (人体計測値ベース)
// =========================================================================

/** COM の高さ係数 (身長に対する比率)。立位で約 55%、踏ん張り時はやや下がる。 */
export const COM_HEIGHT_RATIO_STAND = 0.55;
/** ディフェンシブスタンス時の COM 高さ係数 (膝を曲げて低く構える) */
export const COM_HEIGHT_RATIO_STANCE = 0.48;

/** スタンス幅係数 (腰幅に対する比率)。1.0-1.5 が安定範囲。 */
export const STANCE_WIDTH_RATIO_NORMAL = 0.35;  // 通常立位、腰幅 ≈ 身長 × 0.20、 → 約 1.0× 腰幅
export const STANCE_WIDTH_RATIO_DEFENSIVE = 0.50; // ディフェンシブスタンス、約 1.5× 腰幅

/** バランス値の閾値 */
export const BALANCE_STABLE = 0.7;     // ≥ 0.7 = 安定、急方向転換可能
export const BALANCE_RECOVERING = 0.4; // ≥ 0.4 = やや崩れ、減速気味
                                        // < 0.4 = 体勢崩れ、次の動きが遅延

/** COM が base of support の外に出るまでの体勢崩れ閾値 (m) */
export const COM_OFFSET_LIMIT = 0.25;

// =========================================================================
// 計算ヘルパー
// =========================================================================

/** スケール (身長/200cm) からスタンス幅 (m) を計算 */
export function computeStanceWidth(scale: number, stance: 'normal' | 'defensive' = 'normal'): number {
  const ratio = stance === 'defensive' ? STANCE_WIDTH_RATIO_DEFENSIVE : STANCE_WIDTH_RATIO_NORMAL;
  // ENTITY_HEIGHT (2.0m) × scale × stance_ratio
  return 2.0 * scale * ratio;
}

/** COM Y 高さ (m) を計算 */
export function computeCOMHeight(scale: number, stance: 'normal' | 'defensive' = 'normal'): number {
  const ratio = stance === 'defensive' ? COM_HEIGHT_RATIO_STANCE : COM_HEIGHT_RATIO_STAND;
  return 2.0 * scale * ratio;
}

// =========================================================================
// バランス評価
// =========================================================================

export interface BalanceState {
  /** COM が基底面 (base of support) からどれだけ前傾しているか (m, 正=前) */
  comOffsetForward: number;
  /** COM が基底面から横にどれだけ偏っているか (m, 正=右) */
  comOffsetLateral: number;
  /** バランス値 0..1 (1=完全安定、0=完全崩れ) */
  balance: number;
}

/**
 * 直近フレームの加速度・速度・facing からバランス状態を推定。
 * 既存の `lastSpeed`, `vx/vz`, `facing` を入力とする (SimMover に既存)。
 *
 * 簡略化された物理モデル:
 *  - COM offset = 加速度 × 反応係数 (急加速で前傾、急減速で後傾)
 *  - balance = 1 - clamp(|offset| / COM_OFFSET_LIMIT, 0, 1)
 */
export function evaluateBalance(
  mover: SimMover,
  prevSpeed: number,
  dt: number,
): BalanceState {
  if (dt <= 0) {
    return { comOffsetForward: 0, comOffsetLateral: 0, balance: 1.0 };
  }

  // 加速度 (m/s²)。正 = 加速、負 = 減速
  const accel = (mover.lastSpeed - prevSpeed) / dt;
  // 移動方向 (facing と異なる場合あり)
  const moveLen = Math.sqrt(mover.vx * mover.vx + mover.vz * mover.vz);
  const moveAngle = moveLen > 0.01 ? Math.atan2(mover.vz, mover.vx) : mover.facing;
  const facingDiff = moveAngle - mover.facing;

  // 前傾/後傾: 加速度 × 0.05 (経験則)
  // 加速 +5m/s² → +0.25m 前傾 (limit ギリギリ)
  const comOffsetForward = accel * 0.05 * Math.cos(facingDiff);
  const comOffsetLateral = accel * 0.05 * Math.sin(facingDiff);

  const offsetMag = Math.sqrt(comOffsetForward * comOffsetForward + comOffsetLateral * comOffsetLateral);
  const balance = Math.max(0, 1.0 - offsetMag / COM_OFFSET_LIMIT);

  return { comOffsetForward, comOffsetLateral, balance };
}

/**
 * バランスが崩れている (相手にとって付けこめる) か判定。
 * ディフェンスのドリブルムーブ発火条件で使用。
 */
export function isOffBalance(balance: number): boolean {
  return balance < BALANCE_RECOVERING;
}

/**
 * 急方向転換が可能か (バランスが安定しているか)。
 */
export function canChangeDirection(balance: number): boolean {
  return balance >= BALANCE_STABLE;
}
