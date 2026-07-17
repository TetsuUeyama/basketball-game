/**
 * MovementCore — 旋回・移動・分離の基礎数学。
 *
 * 旧バスケ Movement/MovementCore.ts からの移植・汎用化:
 *  - FieldConfig / BallTimingConfig / CenterOfMass 依存を除去
 *  - Math.random 直呼び（randAngle/randTurn/randFire）を削除（乱数は呼び出し側がRNG注入）
 *  - 角度規約を +Z基準に統一
 *  - フィールド境界 bounce は削除（壁衝突 = Map/Collision が担当）
 *  - turnToward / turnNeckToward / dirSpeedMult / separateEntities を継承
 */

import { angleOf, dirX, dirZ, normAngleDiff } from '../Core/MathUtils';
import type { BaseMap } from '../Map/MapTypes';
import { resolveCircleCollision } from '../Map/Collision';
import {
  SEPARATE_MAX_PUSH_PER_PAIR,
  SEPARATE_MAX_PUSH_PER_ENTITY,
} from '../Config/AgentConfig';

/** 現在角から目標角へ最大 maxDelta まで回頭した角を返す */
export function turnToward(current: number, target: number, maxDelta: number): number {
  const diff = normAngleDiff(current, target);
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

/** 首を目標角へ回す。体正面から ±neckMaxAngle にクランプ */
export function turnNeckToward(
  bodyFacing: number,
  currentNeck: number,
  targetAngle: number,
  maxDelta: number,
  neckMaxAngle: number,
): number {
  const turned = turnToward(currentNeck, targetAngle, maxDelta);
  let rel = normAngleDiff(bodyFacing, turned);
  if (rel > neckMaxAngle) rel = neckMaxAngle;
  if (rel < -neckMaxAngle) rel = -neckMaxAngle;
  return bodyFacing + rel;
}

/** 向きと移動方向の角度差による速度補正（前1.0 → 横0.7 → 後0.4） */
export function dirSpeedMult(facing: number, moveAngle: number): number {
  const cosA = Math.cos(normAngleDiff(facing, moveAngle));
  return 0.7 + 0.3 * cosA;
}

export interface MoveResult {
  /** このtickで実際に動いた距離 (m) */
  moved: number;
  /** 目標に到達済みか（arriveDist 以内） */
  arrived: boolean;
}

/**
 * 目標地点へ向かって旋回しつつ前進する（向き＝進行方向を保証する移動）。
 *  - facing を目標方向へ turnRate で回頭
 *  - 前進は常に facing 方向（=カプセルの鼻の向きと移動方向が一致する）
 *  - 目標が真後ろに近い間（90°超）はその場旋回のみ
 *  - 移動後は壁衝突で押し出し
 */
export function moveTowards(
  agent: { x: number; z: number; facing: number },
  targetX: number,
  targetZ: number,
  speed: number,
  turnRate: number,
  dt: number,
  map: BaseMap,
  radius: number,
  arriveDist: number,
): MoveResult {
  const dx = targetX - agent.x;
  const dz = targetZ - agent.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist <= arriveDist) return { moved: 0, arrived: true };

  const targetAngle = angleOf(dx, dz);
  agent.facing = turnToward(agent.facing, targetAngle, turnRate * dt);

  // 目標がほぼ真後ろの間は旋回のみ（後ずさり・横滑りを防ぐ）
  const remainingDiff = Math.abs(normAngleDiff(agent.facing, targetAngle));
  if (remainingDiff > Math.PI / 2) return { moved: 0, arrived: false };

  const step = Math.min(speed * dt, dist);
  const prevX = agent.x;
  const prevZ = agent.z;
  const nx = agent.x + dirX(agent.facing) * step;
  const nz = agent.z + dirZ(agent.facing) * step;
  const resolved = resolveCircleCollision(map, nx, nz, radius);
  agent.x = resolved.x;
  agent.z = resolved.z;
  const moved = Math.sqrt((agent.x - prevX) ** 2 + (agent.z - prevZ) ** 2);
  return { moved, arrived: false };
}

/**
 * 重なったエージェント同士を体重の逆比で押し離す。
 * per-pair / per-entity の二重キャップでワープ防止（旧バスケ実装の知見を継承）。
 */
export function separateAgents(
  all: { x: number; z: number; radius: number; weight: number }[],
  map: BaseMap,
): void {
  const pushX = new Array(all.length).fill(0);
  const pushZ = new Array(all.length).fill(0);

  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const distSq = dx * dx + dz * dz;
      const minDist = a.radius + b.radius;
      if (distSq >= minDist * minDist || distSq < 0.0001) continue;
      const dist = Math.sqrt(distSq);
      const overlap = Math.min(minDist - dist, SEPARATE_MAX_PUSH_PER_PAIR);
      const nx = dx / dist;
      const nz = dz / dist;
      const totalWeight = a.weight + b.weight;
      const aRatio = b.weight / totalWeight;
      const bRatio = a.weight / totalWeight;
      pushX[i] += -nx * overlap * aRatio;
      pushZ[i] += -nz * overlap * aRatio;
      pushX[j] += nx * overlap * bRatio;
      pushZ[j] += nz * overlap * bRatio;
    }
  }

  for (let i = 0; i < all.length; i++) {
    const mag = Math.sqrt(pushX[i] * pushX[i] + pushZ[i] * pushZ[i]);
    if (mag <= 0.0001) continue;
    const scale = Math.min(mag, SEPARATE_MAX_PUSH_PER_ENTITY) / mag;
    const nx = all[i].x + pushX[i] * scale;
    const nz = all[i].z + pushZ[i] * scale;
    // 押し出し先が壁にめり込まないように解決
    const resolved = resolveCircleCollision(map, nx, nz, all[i].radius);
    all[i].x = resolved.x;
    all[i].z = resolved.z;
  }
}
