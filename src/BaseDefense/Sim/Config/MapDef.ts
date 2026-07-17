/**
 * MapDef — 基地マップ第1面の定義。
 *
 * 座標系: 原点=マップ中心、X∈[-30,30]、Z∈[-20,20] (m)。
 * 構成: 外周フェンス（視線は通る・移動は遮る）＋南門、機密庫（建物A）、
 *       兵舎（建物B）、遮蔽用クレート数個、南門外に侵入者スポーン/離脱ゾーン。
 */

import type { BaseMap, WallSeg } from '../Map/MapTypes';

const WALL_H = 3.0;   // 建物壁の高さ (m)
const FENCE_H = 2.0;  // フェンスの高さ
const CRATE_H = 1.4;  // クレートの高さ

/** 建物壁（視線・移動とも遮る） */
function wall(x1: number, z1: number, x2: number, z2: number, doorId?: number): WallSeg {
  return { x1, z1, x2, z2, blocksVision: true, blocksMove: true, doorId, height: WALL_H };
}

/** フェンス（金網 — 視線は通る・移動は遮る） */
function fence(x1: number, z1: number, x2: number, z2: number): WallSeg {
  return { x1, z1, x2, z2, blocksVision: false, blocksMove: true, height: FENCE_H };
}

/** クレート（低い遮蔽 — 視線・移動とも遮る） */
function crate(x1: number, z1: number, x2: number, z2: number): WallSeg {
  return { x1, z1, x2, z2, blocksVision: true, blocksMove: true, height: CRATE_H };
}

export function createBaseMap(): BaseMap {
  const walls: WallSeg[] = [
    // ---- 外周フェンス（南門: x∈[-2,2] が開口） ----
    fence(-28, -18, -2, -18),
    fence(2, -18, 28, -18),
    fence(-28, 18, 28, 18),
    fence(-28, -18, -28, 18),
    fence(28, -18, 28, 18),

    // ---- 建物A: 機密庫 x∈[-20,-8], z∈[4,14]。南壁にドア x∈[-15,-13] ----
    wall(-20, 4, -15, 4),
    wall(-15, 4, -13, 4, 1), // ドア (doorId=1)
    wall(-13, 4, -8, 4),
    wall(-20, 14, -8, 14),
    wall(-20, 4, -20, 14),
    wall(-8, 4, -8, 14),

    // ---- 建物B: 兵舎 x∈[8,20], z∈[-14,-4]。北壁にドア x∈[13,15] ----
    wall(8, -4, 13, -4),
    wall(13, -4, 15, -4, 2), // ドア (doorId=2)
    wall(15, -4, 20, -4),
    wall(8, -14, 20, -14),
    wall(8, -14, 8, -4),
    wall(20, -14, 20, -4),

    // ---- クレート（遮蔽物） ----
    crate(-2, -6, 2, -6),
    crate(2, 6, 6, 6),
    crate(-24, -8, -20, -8),
  ];

  return {
    width: 60,
    depth: 40,
    walls,
    // ドアは当面「開いた出入口」として扱う（開閉メカニクスは後続Phase）
    doors: [
      { id: 1, open: true },
      { id: 2, open: true },
    ],
    // 機密（侵入目標）は建物Aの中
    objective: { x: -14, z: 9 },
    // 南門の外が離脱ゾーン
    exfilZones: [{ x: 0, z: -19.2, r: 1.6 }],
    intruderSpawns: [{ x: 0, z: -19.2 }],
  };
}
