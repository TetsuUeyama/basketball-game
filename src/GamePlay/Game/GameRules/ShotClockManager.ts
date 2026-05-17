/**
 * ShotClockManager — 24 秒 / オフェンスリバウンド 14 秒のショットクロック管理
 * NBA ルール準拠。
 */

export const SHOT_CLOCK_FULL_SEC = 24;
export const SHOT_CLOCK_OFFENSIVE_REBOUND_SEC = 14;

export class ShotClockManager {
  private remainingSeconds: number = SHOT_CLOCK_FULL_SEC;
  private active: boolean = false;
  private violated: boolean = false;

  /**
   * リセット: 新ポゼッション (24 秒) または オフェンスリバウンド (14 秒)。
   * 同時にカウントダウン開始。
   */
  reset(seconds: 14 | 24 = SHOT_CLOCK_FULL_SEC): void {
    this.remainingSeconds = seconds;
    this.active = true;
    this.violated = false;
  }

  /** クロックを一時停止（ファウル、デッドボール時など） */
  pause(): void { this.active = false; }

  /** クロックを再開 */
  resume(): void {
    if (!this.violated && this.remainingSeconds > 0) {
      this.active = true;
    }
  }

  /** クロックを完全停止（クォーター終了、ハーフタイム、タイムアウト） */
  stop(): void {
    this.active = false;
  }

  /**
   * 経過時間で進める。
   * @returns true if 24-second violation occurred this tick
   */
  tick(dt: number): boolean {
    if (!this.active || this.violated) return false;
    this.remainingSeconds -= dt;
    if (this.remainingSeconds <= 0) {
      this.remainingSeconds = 0;
      this.active = false;
      this.violated = true;
      return true;
    }
    return false;
  }

  /** バイオレーションフラグをクリア（次のポゼッションへ） */
  clearViolation(): void {
    this.violated = false;
  }

  getRemainingSeconds(): number { return this.remainingSeconds; }
  isActive(): boolean { return this.active; }
  isViolation(): boolean { return this.violated; }

  /** UI 表示用: 0.0 単位の小数で残り秒数を取得 */
  getDisplayTime(): string {
    return this.remainingSeconds.toFixed(1);
  }
}
