/**
 * Hearing — 音イベントの発生と聴取判定。
 *
 * 音は「発生座標＋基本半径＋寿命」のイベント。壁1枚ごとに到達半径が
 * SOUND_WALL_ATTENUATION 倍に減衰する（壁越しにはくぐもって届く）。
 */

import type { BaseMap } from '../Map/MapTypes';
import { countBlockingWalls } from '../Map/Occlusion';
import { dist2d } from '../Core/MathUtils';

export type SoundKind = 'footstep' | 'run' | 'door' | 'gunshot' | 'melee';

export interface SoundEvent {
  id: number;
  x: number;
  z: number;
  /** 遮蔽なしでの到達半径 (m) */
  radius: number;
  kind: SoundKind;
  emitterId: number;
  time: number;
  expiresAt: number;
  /** 既にこの音を処理した聴取者ID（多重検知防止） */
  heardBy: Set<number>;
}

export function makeSound(
  id: number,
  x: number,
  z: number,
  radius: number,
  kind: SoundKind,
  emitterId: number,
  time: number,
  lifetimeSec: number,
): SoundEvent {
  return {
    id, x, z, radius, kind, emitterId, time,
    expiresAt: time + lifetimeSec,
    heardBy: new Set(),
  };
}

/**
 * 聴取者に音が届くか。壁枚数で半径を減衰させて距離判定。
 */
export function canHear(
  map: BaseMap,
  sound: SoundEvent,
  listenerX: number,
  listenerZ: number,
  wallAttenuation: number,
): boolean {
  if (sound.radius <= 0) return false;
  const d = dist2d(sound.x, sound.z, listenerX, listenerZ);
  if (d > sound.radius) return false; // 素の半径外なら壁計算前に棄却
  const walls = countBlockingWalls(map, sound.x, sound.z, listenerX, listenerZ);
  const effRadius = sound.radius * Math.pow(wallAttenuation, walls);
  return d <= effRadius;
}
