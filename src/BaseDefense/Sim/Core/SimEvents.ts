/**
 * SimEvents — ハーネス計測・HUD表示用のイベントログ。
 *
 * 「イベント発火数だけでは偽陽性を掴む」教訓（soccer-sim）に従い、
 * 全イベントに座標を残す。ハーネスは頻度＋幾何の両面で検証する。
 */

export type SimEventKind =
  | 'sighting'        // 視認獲得（未視認→視認の立ち上がりのみ記録）
  | 'sighting_lost'   // 視認喪失
  | 'sound_heard'     // 聴覚検知
  | 'radio'           // 無線共有の配送
  | 'fsm_change'      // 兵士FSM遷移
  | 'camera_detect'   // 監視カメラ検知
  | 'camera_disabled' // 侵入者によるカメラ無効化
  | 'camera_feed_lost'// 管制が映像喪失に気づき調査を指示
  | 'checkpoint_repaired' // チェックポイント修理完了
  | 'gate_opened'     // 規定数の修理でゴールの門が開いた
  | 'shot'            // 発砲
  | 'kill'            // 排除/死亡
  | 'objective_taken' // 機密奪取
  | 'exfil'           // 侵入者離脱
  | 'match_end';      // 勝敗確定

export interface SimEvent {
  time: number;
  kind: SimEventKind;
  /** 行動主体のエンティティID */
  actorId?: number;
  /** 対象のエンティティID */
  targetId?: number;
  /** イベント発生座標（必ず入れる — 幾何検証用） */
  x: number;
  z: number;
  /** 補足（FSM遷移先、音種別など） */
  detail?: string;
}

export function pushEvent(events: SimEvent[], ev: SimEvent): void {
  events.push(ev);
}
