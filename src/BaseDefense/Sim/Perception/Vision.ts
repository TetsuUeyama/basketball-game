/**
 * Vision — 視野 (FOV) 判定と視認記憶。
 *
 * 旧バスケ Body/Vision.ts からの移植・汎用化:
 *  - 中心視野（高解像度・即認識）と周辺視野（動体検知・違和感）の2層FOVは維持
 *  - SimMover 依存を排し、構造的型 VisionObserver に変更
 *  - FOV定数のモジュール直書きをやめ VisionParams 注入に変更
 *  - 角度規約を +Z基準 (angleOf) に統一（旧コードは atan2(dz,dx) の +X基準だった）
 *  - 遮蔽判定フック isOccluded を canSee に追加（壁の Line of Sight）
 *  - バスケ固有の ScanState (pre-catch 等) は削除
 */

import { angleOf, normAngleDiff } from '../Core/MathUtils';

export type VisionTier = 'central' | 'peripheral' | 'none';

export interface VisionParams {
  /** 中心視野の半角 (rad) */
  centralHalfAngle: number;
  /** 中心視野の最大認識距離 (m) */
  centralRange: number;
  /** 周辺視野の半角 (rad) */
  peripheralHalfAngle: number;
  /** 周辺視野の最大認識距離 (m) */
  peripheralRange: number;
}

export interface VisionObserver {
  x: number;
  z: number;
  /** 視線の向き（兵士なら首、カメラならレンズの向き。+Z基準rad） */
  neckFacing: number;
}

/** 遮蔽判定関数: (ax,az)→(bx,bz) の視線が遮られていれば true */
export type OcclusionFn = (ax: number, az: number, bx: number, bz: number) => boolean;

/**
 * 指定方向・距離が観察者の視野のどの層に入るか。
 */
export function classifyInFOV(
  observerFacing: number,
  dx: number,
  dz: number,
  p: VisionParams,
): VisionTier {
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.01) return 'central'; // 密着
  const targetAngle = angleOf(dx, dz);
  const angDiff = Math.abs(normAngleDiff(observerFacing, targetAngle));

  if (angDiff <= p.centralHalfAngle && dist <= p.centralRange) return 'central';
  if (angDiff <= p.peripheralHalfAngle && dist <= p.peripheralRange) return 'peripheral';
  return 'none';
}

/**
 * 観察者から対象が見えるか（FOV + 遮蔽）。
 */
export function canSee(
  observer: VisionObserver,
  target: { x: number; z: number },
  p: VisionParams,
  isOccluded?: OcclusionFn,
): VisionTier {
  const tier = classifyInFOV(
    observer.neckFacing,
    target.x - observer.x,
    target.z - observer.z,
    p,
  );
  if (tier === 'none') return 'none';
  if (isOccluded && isOccluded(observer.x, observer.z, target.x, target.z)) {
    return 'none';
  }
  return tier;
}

// =========================================================================
// 視認記憶（last-seen キャッシュ）
// =========================================================================

export interface ScannedEntity {
  entityId: number;
  lastSeenTime: number;
  lastSeenX: number;
  lastSeenZ: number;
  lastSeenTier: VisionTier;
}

export interface VisionMemory {
  entities: Map<number, ScannedEntity>;
}

export function makeVisionMemory(): VisionMemory {
  return { entities: new Map() };
}

export function recordSighting(
  memory: VisionMemory,
  entityId: number,
  x: number,
  z: number,
  tier: VisionTier,
  simTime: number,
): void {
  memory.entities.set(entityId, {
    entityId,
    lastSeenTime: simTime,
    lastSeenX: x,
    lastSeenZ: z,
    lastSeenTier: tier,
  });
}

/**
 * 記憶から対象の最終目撃情報を取得。memorySec を過ぎていたら失効して null。
 */
export function recallEntity(
  memory: VisionMemory,
  entityId: number,
  simTime: number,
  memorySec: number,
): ScannedEntity | null {
  const entry = memory.entities.get(entityId);
  if (!entry) return null;
  if (simTime - entry.lastSeenTime > memorySec) {
    memory.entities.delete(entityId);
    return null;
  }
  return entry;
}
