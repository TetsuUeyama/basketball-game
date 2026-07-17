/**
 * Occlusion — 2D線分交差による視線遮蔽判定。
 *
 * Babylon Ray は使わない（Sim コアはレンダリング非依存 — ヘッドレス実行のため）。
 * 壁は数十本なので総当たり O(壁数) で十分。
 */

import type { BaseMap, WallSeg } from './MapTypes';
import { isWallActive } from './MapTypes';

/** 線分 (a-b) と (c-d) が交差するか（端点接触も交差扱い） */
export function segmentsIntersect(
  ax: number, az: number, bx: number, bz: number,
  cx: number, cz: number, dx: number, dz: number,
): boolean {
  const d1 = cross(dx - cx, dz - cz, ax - cx, az - cz);
  const d2 = cross(dx - cx, dz - cz, bx - cx, bz - cz);
  const d3 = cross(bx - ax, bz - az, cx - ax, cz - az);
  const d4 = cross(bx - ax, bz - az, dx - ax, dz - az);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  // 共線上の端点接触
  if (d1 === 0 && onSegment(cx, cz, dx, dz, ax, az)) return true;
  if (d2 === 0 && onSegment(cx, cz, dx, dz, bx, bz)) return true;
  if (d3 === 0 && onSegment(ax, az, bx, bz, cx, cz)) return true;
  if (d4 === 0 && onSegment(ax, az, bx, bz, dx, dz)) return true;
  return false;
}

function cross(x1: number, z1: number, x2: number, z2: number): number {
  return x1 * z2 - z1 * x2;
}

function onSegment(
  px: number, pz: number, qx: number, qz: number, rx: number, rz: number,
): boolean {
  return (
    Math.min(px, qx) <= rx && rx <= Math.max(px, qx) &&
    Math.min(pz, qz) <= rz && rz <= Math.max(pz, qz)
  );
}

/** 視線 (a→b) が視線遮蔽壁に遮られているか */
export function isOccluded(
  map: BaseMap,
  ax: number, az: number, bx: number, bz: number,
): boolean {
  for (const w of map.walls) {
    if (!w.blocksVision) continue;
    if (!isWallActive(w, map.doors)) continue;
    if (segmentsIntersect(ax, az, bx, bz, w.x1, w.z1, w.x2, w.z2)) return true;
  }
  return false;
}

/** 線分 (a→b) を横切る視線遮蔽壁の枚数（聴覚の壁越し減衰用） */
export function countBlockingWalls(
  map: BaseMap,
  ax: number, az: number, bx: number, bz: number,
): number {
  let count = 0;
  for (const w of map.walls) {
    if (!w.blocksVision) continue;
    if (!isWallActive(w, map.doors)) continue;
    if (segmentsIntersect(ax, az, bx, bz, w.x1, w.z1, w.x2, w.z2)) count++;
  }
  return count;
}

/**
 * レイ (origin, 方向ベクトル) が最初に視線遮蔽壁へ当たるまでの距離。
 * 当たらなければ maxDist。視界コーンの描画クリップに使う。
 */
export function castRayDistance(
  map: BaseMap,
  ox: number, oz: number,
  dx: number, dz: number,
  maxDist: number,
): number {
  let nearest = maxDist;
  const ex = ox + dx * maxDist;
  const ez = oz + dz * maxDist;
  for (const w of map.walls) {
    if (!w.blocksVision) continue;
    if (!isWallActive(w, map.doors)) continue;
    const t = raySegmentT(ox, oz, ex, ez, w);
    if (t !== null && t * maxDist < nearest) nearest = t * maxDist;
  }
  return nearest;
}

/** レイ線分 (o→e) と壁の交点パラメータ t (0..1)。交差しなければ null */
function raySegmentT(
  ox: number, oz: number, ex: number, ez: number, w: WallSeg,
): number | null {
  const rdx = ex - ox;
  const rdz = ez - oz;
  const sdx = w.x2 - w.x1;
  const sdz = w.z2 - w.z1;
  const denom = cross(rdx, rdz, sdx, sdz);
  if (denom === 0) return null; // 平行
  const t = cross(w.x1 - ox, w.z1 - oz, sdx, sdz) / denom;
  const u = cross(w.x1 - ox, w.z1 - oz, rdx, rdz) / denom;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t;
  return null;
}
