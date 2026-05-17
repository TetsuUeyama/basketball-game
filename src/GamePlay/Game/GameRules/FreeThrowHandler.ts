/**
 * FreeThrowHandler — フリースロー自動解決（簡易版）
 *
 * 本格的なフリースロー描画は将来実装。現状は確率ベースで成否を即時決定し、
 * teamScores に +1 点ずつ加算する。
 *
 * NBA ルール:
 *  - シューティングファウル: 2P 圏内→2本、3P 圏内→3本、シュート成功 (and-1) → 1本
 *  - ボーナス時の非シューティングファウル: 2本
 *  - テクニカルファウル: 1本
 */

/** NBA 平均 FT 成功率 (約 78%) */
export const FT_BASE_MAKE_PROB = 0.78;

export interface FreeThrowResolution {
  attempts: number;
  made: number;
}

/**
 * 指定本数の FT を確率で解決する。
 * @param attempts 本数 (1, 2, または 3)
 * @param ftMakeProb 成功率 (省略時は FT_BASE_MAKE_PROB)
 */
export function resolveFreeThrows(
  attempts: 1 | 2 | 3,
  ftMakeProb: number = FT_BASE_MAKE_PROB,
): FreeThrowResolution {
  let made = 0;
  for (let i = 0; i < attempts; i++) {
    if (Math.random() < ftMakeProb) made++;
  }
  return { attempts, made };
}

/**
 * シュート位置と pointValue (2/3) からシューティングファウル時の FT 本数を返す。
 *  - shotMade=true → 1 本 (and-1)
 *  - shotMade=false, pointValue=2 → 2 本
 *  - shotMade=false, pointValue=3 → 3 本
 */
export function getShootingFoulFreeThrowAttempts(
  pointValue: 2 | 3,
  shotMade: boolean,
): 1 | 2 | 3 {
  if (shotMade) return 1;
  return pointValue;
}
