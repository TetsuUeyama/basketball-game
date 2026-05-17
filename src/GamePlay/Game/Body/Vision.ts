/**
 * Vision — 視野 (FOV) システム拡張
 *
 * リサーチ根拠:
 *  - 80% の視覚情報は周辺視野で取得 (Australia Basketball, Nature 論文)
 *  - 中心視野 (高解像度) と周辺視野 (動体検知) を区別
 *  - スキャンは「ボール受け前 / 受けた瞬間 / 受けた後」の 3 タイミング (Basketball Immersion)
 *  - 熟練者は 90° 以上の視野角でも高速反応
 *
 * ゲーム AI として再現する目的:
 *  - パス受け前にスキャン → 視認した味方/敵の位置をキャッシュ
 *  - 周辺視野で気付き、首振りで中心視野に入れる動作
 *  - 視野外の情報は「不確実」扱い (古いキャッシュを参照)
 */

import type { SimMover } from "../Types/TrackingSimTypes";
import { normAngleDiff } from "../Movement/MovementCore";

// =========================================================================
// 視野角定数 (人体計測値ベース)
// =========================================================================

/** 中心視野 (高解像度、両眼視野中央)。半角 30° = 全 60°。 */
export const FOV_CENTRAL_HALF = Math.PI / 6;     // 30°
/** 周辺視野 (動体検知、両眼総視野)。半角 100° = 全 200°。実人体は約 ±100° (両眼合算で 200°)。 */
export const FOV_PERIPHERAL_HALF = Math.PI * 100 / 180;  // 100°

/** 中心視野の最大認識距離 (m) — 細部判別 (味方の表情、向き) */
export const FOV_CENTRAL_RANGE = 12.0;
/** 周辺視野の最大認識距離 (m) — 位置と動きのみ */
export const FOV_PERIPHERAL_RANGE = 8.0;

/** スキャン情報のキャッシュ有効期間 (秒) */
export const SCAN_MEMORY_DURATION = 2.0;
/** ボール受け前のスキャン推奨頻度 (回/秒) */
export const SCAN_FREQ_PRE_CATCH = 3.0;
/** 通常時のスキャン頻度 */
export const SCAN_FREQ_IDLE = 1.0;

// =========================================================================
// 視野判定
// =========================================================================

export type VisionTier = 'central' | 'peripheral' | 'none';

/**
 * 指定方向と距離が観察者の視野のどの範囲に入るか判定。
 * @param observerFacing 観察者の首向き (neckFacing 推奨)
 * @param dx 観察対象 - 観察者の X 差分
 * @param dz 観察対象 - 観察者の Z 差分
 */
export function classifyInFOV(
  observerFacing: number,
  dx: number,
  dz: number,
): VisionTier {
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.01) return 'central'; // 自分自身
  const targetAngle = Math.atan2(dz, dx);
  const angDiff = Math.abs(normAngleDiff(observerFacing, targetAngle));

  if (angDiff <= FOV_CENTRAL_HALF && dist <= FOV_CENTRAL_RANGE) return 'central';
  if (angDiff <= FOV_PERIPHERAL_HALF && dist <= FOV_PERIPHERAL_RANGE) return 'peripheral';
  return 'none';
}

/**
 * SimMover の neckFacing 基準で対象を視認できるか判定。
 */
export function canSee(observer: SimMover, target: { x: number; z: number }): VisionTier {
  return classifyInFOV(observer.neckFacing, target.x - observer.x, target.z - observer.z);
}

// =========================================================================
// スキャン状態
// =========================================================================

/**
 * パスを受ける前後でのスキャン状態。
 *  - 'pre-catch': パスが飛んでくる前、自分の DF + 味方の配置を確認すべき
 *  - 'on-catch': パスをキャッチした瞬間、最も重要な意思決定
 *  - 'post-catch': キャッチ後、相手のリアクションを確認
 *  - 'idle': ボールが遠い、通常のオフボール状態
 */
export type ScanState = 'pre-catch' | 'on-catch' | 'post-catch' | 'idle';

/**
 * 視認した対象の情報キャッシュ。
 * 視野から外れても N 秒間は記憶として残る。
 */
export interface ScannedEntity {
  entityIdx: number;
  /** 最後に視認した時刻 (sim time accum) */
  lastSeenTime: number;
  /** 最後に視認した位置 */
  lastSeenX: number;
  lastSeenZ: number;
  /** 視認時の tier */
  lastSeenTier: VisionTier;
}

export interface VisionMemory {
  /** entityIdx → 最後の観察情報 */
  entities: Map<number, ScannedEntity>;
  /** 現在のスキャン状態 */
  scanState: ScanState;
  /** 次回スキャン推奨時刻 (sim time accum) */
  nextScanTime: number;
}

export function makeVisionMemory(): VisionMemory {
  return {
    entities: new Map(),
    scanState: 'idle',
    nextScanTime: 0,
  };
}

/**
 * 視認した対象をメモリに記録/更新。
 */
export function recordSighting(
  memory: VisionMemory,
  entityIdx: number,
  x: number,
  z: number,
  tier: VisionTier,
  simTime: number,
): void {
  memory.entities.set(entityIdx, {
    entityIdx,
    lastSeenTime: simTime,
    lastSeenX: x,
    lastSeenZ: z,
    lastSeenTier: tier,
  });
}

/**
 * メモリから対象の最近の位置を取得。
 * 期間切れ (SCAN_MEMORY_DURATION 超過) なら null。
 */
export function recallEntity(
  memory: VisionMemory,
  entityIdx: number,
  simTime: number,
): ScannedEntity | null {
  const entry = memory.entities.get(entityIdx);
  if (!entry) return null;
  if (simTime - entry.lastSeenTime > SCAN_MEMORY_DURATION) {
    memory.entities.delete(entityIdx);
    return null;
  }
  return entry;
}

/**
 * 観察者の現在の視野で対象群をスキャンし、memory を更新する。
 * オンボール選手やボール受け前のレシーバーが定期的に呼ぶ想定。
 */
export function performScan(
  observer: SimMover,
  targets: { entityIdx: number; x: number; z: number }[],
  memory: VisionMemory,
  simTime: number,
): number {
  let sightedCount = 0;
  for (const t of targets) {
    const tier = canSee(observer, t);
    if (tier !== 'none') {
      recordSighting(memory, t.entityIdx, t.x, t.z, tier, simTime);
      sightedCount++;
    }
  }
  // 次回スキャン時刻を更新
  const freq = memory.scanState === 'pre-catch' ? SCAN_FREQ_PRE_CATCH : SCAN_FREQ_IDLE;
  memory.nextScanTime = simTime + 1.0 / freq;
  return sightedCount;
}

/**
 * スキャン状態を遷移させる。
 */
export function setScanState(memory: VisionMemory, state: ScanState): void {
  memory.scanState = state;
}
