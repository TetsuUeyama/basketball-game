/**
 * MapTypes — 基地マップのデータ構造。
 *
 * 壁線分群 walls が遮蔽（視線）・衝突（移動）・経路探索すべての唯一の真実。
 * View 側のメッシュはこのデータから生成するだけで、独自のジオメトリを持たない。
 */

/** 壁線分。XZ平面上の (x1,z1)-(x2,z2) */
export interface WallSeg {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  /** 視線を遮るか（フェンスは false にできる） */
  blocksVision: boolean;
  /** 移動を遮るか */
  blocksMove: boolean;
  /** ドア線分の場合、対応する DoorState.id。ドアが open なら遮蔽・衝突とも無効 */
  doorId?: number;
  /** 描画高さ (m)。省略時は標準壁高 */
  height?: number;
}

export interface DoorState {
  id: number;
  open: boolean;
}

/** 円形ゾーン（離脱地点など） */
export interface CircleZone {
  x: number;
  z: number;
  r: number;
}

export interface BaseMap {
  /** X方向全幅 (m)。原点はマップ中心 */
  width: number;
  /** Z方向全幅 (m) */
  depth: number;
  walls: WallSeg[];
  doors: DoorState[];
  /** 侵入目標（機密）位置 */
  objective: { x: number; z: number };
  /** 侵入者の離脱ゾーン */
  exfilZones: CircleZone[];
  /** 侵入者のスポーン地点 */
  intruderSpawns: { x: number; z: number }[];
}

/** 巡回ルート */
export interface PatrolPoint {
  x: number;
  z: number;
  /** 到達後の待機秒 */
  waitSec: number;
  /** 待機中に向く方角（+Z基準rad）。省略時は進行方向のまま */
  lookAngle?: number;
}

export interface PatrolRoute {
  points: PatrolPoint[];
  /** cycle: 末尾→先頭へ循環 / pingpong: 往復 */
  mode: 'cycle' | 'pingpong';
}

/** ドアの現在の開閉状態を導出（doorId無し=常時有効） */
export function isWallActive(wall: WallSeg, doors: DoorState[]): boolean {
  if (wall.doorId === undefined) return true;
  const door = doors.find((d) => d.id === wall.doorId);
  return door ? !door.open : true;
}
