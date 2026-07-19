/**
 * MapDef — 基地マップ第1面の定義。
 *
 * 座標系: 原点=マップ中心、X∈[-30,30]、Z∈[-20,20] (m)。
 * 構成: 外周フェンス（視線は通る・移動は遮る）＋南門、機密庫（建物A）、
 *       兵舎（建物B）、遮蔽用クレート数個、南門外に侵入者スポーン/離脱ゾーン。
 */

import type { BaseMap, WallSeg } from '../Map/MapTypes';

const WALL_H = 3.0;   // 建物壁の高さ (m)
const FENCE_H = 2.2;  // 外周塀の高さ
const CRATE_H = 1.4;  // クレートの高さ

/** 建物壁（視線・移動とも遮る） */
function wall(x1: number, z1: number, x2: number, z2: number, doorId?: number): WallSeg {
  return { x1, z1, x2, z2, blocksVision: true, blocksMove: true, doorId, height: WALL_H };
}

/** 外周塀（視線・移動とも遮る。塀の外は安全な接近路 — 侵入リスクは門に集中させる設計） */
function fence(x1: number, z1: number, x2: number, z2: number): WallSeg {
  return { x1, z1, x2, z2, blocksVision: true, blocksMove: true, height: FENCE_H };
}

/** クレート（低い遮蔽 — 視線・移動とも遮る） */
function crate(x1: number, z1: number, x2: number, z2: number): WallSeg {
  return { x1, z1, x2, z2, blocksVision: true, blocksMove: true, height: CRATE_H };
}

export function createBaseMap(): BaseMap {
  const walls: WallSeg[] = [
    // ---- 外周塀（南門: x∈[-2,2] / 北西裏口: x∈[-26,-22] が開口） ----
    fence(-28, -18, -2, -18),
    fence(2, -18, 28, -18),
    fence(-28, 18, -26, 18),
    fence(-22, 18, 28, 18),
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

    // ---- クレート・遮蔽物（視線の切れる場所を多めに） ----
    crate(-2, -6, 2, -6),
    crate(2, 6, 6, 6),
    crate(-24, -8, -20, -8),
    crate(-8, -12, -4, -12),   // 南中央西
    crate(-18, -14, -15, -14), // 南西内側
    crate(10, 4, 14, 4),       // 中央東
    crate(20, 10, 24, 10),     // 北東
    crate(22, 2, 26, 2),       // 東
    crate(4, 10, 4, 14),       // 北中央（縦）
    crate(12, -17, 16, -17),   // 兵舎の南
    wall(-6, 4, -6, 10),       // 中庭の遮蔽壁（縦）
  ];

  return {
    width: 60,
    depth: 40,
    walls,
    doors: [
      // 建物A（機密庫）の扉 = ゴールの門。チェックポイント修理で開放される
      { id: 1, open: false },
      // 兵舎の扉は開いた出入口
      { id: 2, open: true },
    ],
    // 機密（侵入目標）は建物Aの中
    objective: { x: -14, z: 9 },
    // 南西の角（フェンス外・門番の視界外）がスポーン兼離脱ゾーン
    exfilZones: [{ x: -26, z: -19.2, r: 1.6 }],
    intruderSpawns: [{ x: -26, z: -19.2 }],
    // チェックポイント（配電盤）5か所 — いずれか3つの修理で門が開く
    checkpoints: [
      { id: 1, x: -23, z: -10.5 }, // 西通路（クレートの南陰 — ドア前チェックの視線が通らない）
      { id: 2, x: -11, z: -15.3 }, // 南（クレートの南側・門カメラの圏外）
      { id: 3, x: 24, z: 6 },     // 東（クレートの間）
      { id: 4, x: 6.5, z: 12.5 }, // 北中央東（縦クレートc5の陰 — S1レーンから遮蔽）
      { id: 5, x: 18, z: 13 },    // 北東
    ],
    gate: { doorId: 1, requiredRepairs: 3 },
  };
}
