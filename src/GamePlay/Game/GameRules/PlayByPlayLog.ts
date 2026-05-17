/**
 * PlayByPlayLog — 試合イベントの時系列ログ
 *
 * UI 表示用に直近 N イベントを保持。各イベントは期間 + 残り時間 + テキスト。
 */

export type PlayEventKind =
  | 'tipoff'
  | 'shot-made'
  | 'shot-missed'
  | 'block'
  | 'rebound'
  | 'assist'
  | 'steal'
  | 'turnover'
  | 'foul'
  | 'free-throw'
  | 'violation'
  | 'period-start'
  | 'period-end'
  | 'timeout'
  | 'goaltending'
  | 'out-of-bounds'
  | 'foul-out';

export interface PlayEvent {
  period: string;        // 'Q1', 'OT1' 等
  remaining: number;     // 残り秒
  kind: PlayEventKind;
  text: string;
  team?: 0 | 1;
}

const MAX_EVENTS = 200;

export class PlayByPlayLog {
  private events: PlayEvent[] = [];

  add(event: PlayEvent): void {
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) this.events.shift();
  }

  /** 残り時間を MM:SS 形式に整形 */
  static formatTime(remaining: number): string {
    const total = Math.max(0, Math.ceil(remaining));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  /** 直近 n イベントを新しい順で返す */
  getRecent(n: number = 20): PlayEvent[] {
    return this.events.slice(-n).reverse();
  }

  getAll(): PlayEvent[] {
    return [...this.events];
  }

  reset(): void {
    this.events = [];
  }
}
