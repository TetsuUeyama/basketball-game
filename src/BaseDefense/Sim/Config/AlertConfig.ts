/**
 * AlertConfig — 警戒FSM（PATROL→SUSPICIOUS→SEARCH→COMBAT）のパラメータ。
 * FSM本体は Phase 3 で実装。閾値はヒステリシス＋最低滞在時間でフラッピングを防ぐ。
 */

export const ALERT = {
  /** suspicion がこの値以上で SUSPICIOUS へ */
  suspiciousThreshold: 0.35,
  /** suspicion がこの値以上（=確信）で SEARCH/COMBAT へ */
  confirmThreshold: 1.0,
  /** SUSPICIOUS から復帰する下限（ヒステリシス: 上がる閾値より低く） */
  calmThreshold: 0.15,
  /** suspicion の自然減衰 (毎秒) */
  decayPerSec: 0.08,
  /** 周辺視野で視認した時の suspicion 上昇 (毎秒) */
  risePeripheralPerSec: 0.5,
  /** 中心視野で視認した時の suspicion 上昇 (毎秒) — 約0.6秒で確信 */
  riseCentralPerSec: 1.6,
  /** 聴覚検知1回あたりの suspicion 加算 */
  riseOnSound: 0.4,
  /** 状態の最低滞在秒（フラッピング防止） */
  minStateSec: 1.5,
  /** SEARCH を打ち切って PATROL へ戻るまでの手掛かり無し秒数 */
  searchGiveUpSec: 12,
  /** 無線共有の配送遅延（秒） */
  radioDelaySec: 2.0,
  /** カメラ無効化から管制が映像喪失に気づくまでの秒数 */
  cameraFeedLossNoticeSec: 10,
  /** 無線の到達範囲 (m)。0以下で全域到達 */
  radioRange: 0,
} as const;
