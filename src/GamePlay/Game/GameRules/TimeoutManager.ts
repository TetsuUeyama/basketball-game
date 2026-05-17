/**
 * TimeoutManager — タイムアウト残数管理 (NBA 簡易: 1試合 7 回)
 *
 * 現状の自動シミュレーションではタイムアウトを自動消費しないが、
 * UI 表示および将来の手動介入 (Phase G.4+) のためにカウントを保持する。
 */

export const TIMEOUTS_PER_GAME = 7; // NBA 2018-19 以降のフルタイムアウト数

export class TimeoutManager {
  private remaining: [number, number] = [TIMEOUTS_PER_GAME, TIMEOUTS_PER_GAME];

  /**
   * タイムアウト使用。残数があれば消費して true。
   */
  useTimeout(team: 0 | 1): boolean {
    if (this.remaining[team] <= 0) return false;
    this.remaining[team]--;
    return true;
  }

  getRemaining(team: 0 | 1): number {
    return this.remaining[team];
  }

  reset(): void {
    this.remaining = [TIMEOUTS_PER_GAME, TIMEOUTS_PER_GAME];
  }
}
