/**
 * PerceptionConfig — 知覚（視覚・聴覚）の全パラメータ。
 *
 * 旧バスケVision.tsの定数（記憶2秒・視程12m）はバスケ用の値なので流用せず、
 * 警備員向けに再設定。数値は全てここに集約し、ロジック側への直書きは禁止。
 */

import { degToRad } from '../Core/MathUtils';
import type { VisionParams } from '../Perception/Vision';

/** 兵士の視覚。全体で約70°のコーン（ユーザー指定 — 広すぎる視界を抑える） */
export const SOLDIER_VISION: VisionParams = {
  /** 中心視野半角（細部判別 — 即座に敵と認識）。全50° */
  centralHalfAngle: degToRad(25),
  /** 中心視野の認識距離 (m) */
  centralRange: 16,
  /** 周辺視野半角（動体検知 — 違和感として認識）。全70° */
  peripheralHalfAngle: degToRad(35),
  /** 周辺視野の認識距離 (m) */
  peripheralRange: 9,
};

/** 監視カメラの視覚（単一コーン）。首振りと合わせた実効カバーが広がりすぎない範囲に */
export const CAMERA_VISION: VisionParams = {
  centralHalfAngle: degToRad(32),
  centralRange: 13,
  // カメラに周辺視野は無い（中心と同値にして単一コーン化）
  peripheralHalfAngle: degToRad(32),
  peripheralRange: 13,
};

/** 侵入者の視覚（警備の位置学習用）。プロの侵入者は警備より警戒力が高い */
export const INTRUDER_VISION: VisionParams = {
  centralHalfAngle: degToRad(45),
  centralRange: 26,
  peripheralHalfAngle: degToRad(100),
  peripheralRange: 20,
};

/** 視認記憶の保持秒数（これを過ぎた目撃情報は失効） */
export const VISION_MEMORY_SEC = 30;

/** 音の基本半径 (m)。移動モード・行動ごと */
export const SOUND_RADIUS = {
  sneak: 0,      // 忍び足は無音
  walk: 5,
  run: 13,
  door: 9,
  gunshot: 55,
  melee: 4,
  bodyFound: 0,  // 死体発見は音でなく無線で伝播（Phase 3）
} as const;

/** 壁1枚を挟むごとに音の到達半径に掛かる減衰率 */
export const SOUND_WALL_ATTENUATION = 0.45;

/** 音イベントの寿命（秒）— この間に聴取判定され、以降消える */
export const SOUND_LIFETIME_SEC = 0.5;

/** 足音の発生間隔（秒）。移動モード別 */
export const FOOTSTEP_INTERVAL_SEC = {
  sneak: 0.9,
  walk: 0.55,
  run: 0.33,
} as const;
