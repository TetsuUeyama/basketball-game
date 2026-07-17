/**
 * Collision — 円（エージェント半径） vs 壁線分の移動衝突。
 *
 * 物理エンジンは使わない。移動後の位置が移動遮蔽壁に半径未満まで
 * 近づいていたら法線方向へ押し出す（緩和2パスで角も処理）。
 * 衝突解決はマップ整合性の最終権威（NavGrid より優先）。
 */

import type { BaseMap } from './MapTypes';
import { isWallActive } from './MapTypes';

/** 点 (px,pz) から線分への最近点 */
export function closestPointOnSeg(
  px: number, pz: number,
  x1: number, z1: number, x2: number, z2: number,
): { x: number; z: number } {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-9) return { x: x1, z: z1 };
  let t = ((px - x1) * dx + (pz - z1) * dz) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: x1 + dx * t, z: z1 + dz * t };
}

/**
 * 移動後座標 (x,z) を壁から押し出して返す。
 * 高速移動での壁抜けは想定速度(〜5m/s)×dt(1/60s)≒0.08m ≪ 壁厚相当なので
 * 位置ベース解決で十分。
 */
export function resolveCircleCollision(
  map: BaseMap,
  x: number, z: number,
  radius: number,
): { x: number; z: number } {
  let px = x;
  let pz = z;
  // 緩和2パス: 1パス目の押し出しで別の壁にめり込むケース（角）を2パス目で解消
  for (let pass = 0; pass < 2; pass++) {
    for (const w of map.walls) {
      if (!w.blocksMove) continue;
      if (!isWallActive(w, map.doors)) continue;
      const cp = closestPointOnSeg(px, pz, w.x1, w.z1, w.x2, w.z2);
      const dx = px - cp.x;
      const dz = pz - cp.z;
      const distSq = dx * dx + dz * dz;
      if (distSq >= radius * radius) continue;
      const dist = Math.sqrt(distSq);
      if (dist < 1e-6) {
        // 線分上に完全一致 — 壁の法線方向（線分に垂直）へ押す
        const wx = w.x2 - w.x1;
        const wz = w.z2 - w.z1;
        const wlen = Math.sqrt(wx * wx + wz * wz) || 1;
        px = cp.x + (-wz / wlen) * radius;
        pz = cp.z + (wx / wlen) * radius;
      } else {
        const push = radius - dist;
        px += (dx / dist) * push;
        pz += (dz / dist) * push;
      }
    }
  }
  // マップ外周クランプ（保険）
  const hx = map.width / 2;
  const hz = map.depth / 2;
  if (px < -hx) px = -hx;
  if (px > hx) px = hx;
  if (pz < -hz) pz = -hz;
  if (pz > hz) pz = hz;
  return { x: px, z: pz };
}
