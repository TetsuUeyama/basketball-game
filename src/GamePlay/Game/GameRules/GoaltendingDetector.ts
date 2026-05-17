/**
 * GoaltendingDetector — ゴールテンディング / バスケットインタフィアランス検知
 *
 * NBA ルール:
 *  - ゴールテンディング: ディフェンスがリム高さ以上で下降中のショットに触れる → バスケット成立扱い
 *  - バスケットインタフィアランス: リム上やバスケット内のボールに触れる → バスケット成立扱い
 *
 * 簡略化: ボール Y >= リム高さ かつ ボール下降中（vy < 0 または前フレーム比で下降）
 *         かつディフェンスの手が接触範囲内 → 違反検知
 */

import { GOAL_RIM_Y } from "../Config/GoalConfig";

export interface GoaltendingCheckInput {
  ballX: number;
  ballY: number;
  ballZ: number;
  /** 前フレームのボール Y（下降判定用） */
  prevBallY: number;
  /** ディフェンス選手の手 [left, right] 座標群 */
  defenderHands: { left: { x: number; y: number; z: number }; right: { x: number; y: number; z: number } }[];
}

/** ゴールテンディング判定距離 (ball-hand) */
export const GOALTENDING_TOUCH_RADIUS = 0.18; // m

/**
 * ゴールテンディング判定
 * @returns true = ゴールテンディング成立（バスケット得点扱い）
 */
export function checkGoaltending(input: GoaltendingCheckInput): boolean {
  // リム高以上 & 下降中
  if (input.ballY < GOAL_RIM_Y) return false;
  const descending = input.ballY < input.prevBallY;
  if (!descending) return false;

  // ディフェンスの手と接触
  for (const hands of input.defenderHands) {
    for (const hand of [hands.left, hands.right]) {
      const dx = hand.x - input.ballX;
      const dy = hand.y - input.ballY;
      const dz = hand.z - input.ballZ;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq <= GOALTENDING_TOUCH_RADIUS * GOALTENDING_TOUCH_RADIUS) {
        return true;
      }
    }
  }
  return false;
}
