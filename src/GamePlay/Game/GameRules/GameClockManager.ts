/**
 * GameClockManager — 試合のクォーター・OT 管理
 * NBA ルール基準: 12 分 × 4Q、OT は 5 分。
 */

export type GamePeriod = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'OT1' | 'OT2' | 'OT3' | 'OT4';

export const QUARTER_LENGTH_SEC = 12 * 60; // NBA: 12 min
export const OVERTIME_LENGTH_SEC = 5 * 60; // NBA: 5 min
export const MAX_OVERTIMES = 4;

export interface GameClockEvent {
  type: 'period-end' | 'game-end';
  period: GamePeriod;
}

export class GameClockManager {
  private period: GamePeriod = 'Q1';
  private remainingSeconds: number = QUARTER_LENGTH_SEC;
  private isPaused: boolean = false;
  private gameOver: boolean = false;

  /** 1フレームの経過時間を進める。クォーター終了を検知したら event を返す。 */
  tick(dt: number): GameClockEvent | null {
    if (this.isPaused || this.gameOver) return null;
    this.remainingSeconds -= dt;
    if (this.remainingSeconds <= 0) {
      this.remainingSeconds = 0;
      this.isPaused = true;
      return { type: 'period-end', period: this.period };
    }
    return null;
  }

  /**
   * 次クォーター/OT を開始する。
   * - Q1→Q2, Q2→Q3, Q3→Q4: 12 分
   * - Q4 終了時に同点なら OT1 (5 分)、点差ありなら試合終了
   * - OT 終了時に同点なら次の OT、点差ありなら試合終了
   * - MAX_OVERTIMES を超えた場合は強制的に試合終了
   */
  startNextPeriod(scores: [number, number]): { period: GamePeriod | null; isGameOver: boolean } {
    const next = nextPeriod(this.period, scores);
    if (next === null) {
      this.gameOver = true;
      return { period: null, isGameOver: true };
    }
    this.period = next;
    this.remainingSeconds = next.startsWith('OT') ? OVERTIME_LENGTH_SEC : QUARTER_LENGTH_SEC;
    this.isPaused = false;
    return { period: next, isGameOver: false };
  }

  pause(): void { this.isPaused = true; }
  resume(): void { this.isPaused = false; }

  getRemainingSeconds(): number { return this.remainingSeconds; }
  getPeriod(): GamePeriod { return this.period; }
  isGameOver(): boolean { return this.gameOver; }
  isPausedNow(): boolean { return this.isPaused; }

  /** Q2 終了時（ハーフタイム）か */
  isHalftime(): boolean {
    return this.period === 'Q2' && this.remainingSeconds <= 0;
  }

  /** 残り時間を MM:SS で取得 */
  getDisplayTime(): string {
    const total = Math.max(0, Math.ceil(this.remainingSeconds));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  /** リセット（試合再開始用） */
  reset(): void {
    this.period = 'Q1';
    this.remainingSeconds = QUARTER_LENGTH_SEC;
    this.isPaused = false;
    this.gameOver = false;
  }
}

function nextPeriod(curr: GamePeriod, scores: [number, number]): GamePeriod | null {
  const tied = scores[0] === scores[1];

  // レギュレーション中（Q1→Q4）は同点でも次へ進む
  if (curr === 'Q1') return 'Q2';
  if (curr === 'Q2') return 'Q3';
  if (curr === 'Q3') return 'Q4';

  // Q4 以降は同点なら OT、点差ありなら終了
  if (!tied) return null;

  if (curr === 'Q4') return 'OT1';
  if (curr === 'OT1') return 'OT2';
  if (curr === 'OT2') return 'OT3';
  if (curr === 'OT3') return 'OT4';
  // OT4 でも同点なら強制終了（実バスケでは延長続行だが上限を設ける）
  return null;
}
