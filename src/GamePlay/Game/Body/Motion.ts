/**
 * Motion — 加減速の 3 フェーズモデル
 *
 * リサーチ根拠:
 *  - 水平 GRF が加速性能を支配 (PMC, sprint biomechanics)
 *  - 第一歩は爆発的、Rate of Force Development が肝
 *  - 加速 → 最高速到達 → 減速の 3 段階で動的に変わる速度
 *  - 急減速は COM 後傾、止まるのに 0.3-0.5 秒要する
 *
 * ゲーム AI として再現する目的:
 *  - 静止状態からの第一歩を爆発的に (1.4× boost)
 *  - 最高速到達後はオーバーシュート抑制
 *  - 減速時は次の動作が遅延 (COM 戻しが必要)
 */

import type { SimMover } from "../Types/TrackingSimTypes";

// =========================================================================
// フェーズ定義
// =========================================================================

export type MotionPhase = 'idle' | 'accel' | 'sprint' | 'decel';

// =========================================================================
// パラメータ
// =========================================================================

/** 第一歩の爆発力ブースト係数 (静止から加速開始時の加速度倍率) */
export const FIRST_STEP_BOOST = 1.4;
/** 第一歩ブーストの持続時間 (秒) */
export const FIRST_STEP_DURATION = 0.2;

/** 通常加速時の加速度 (m/s²) */
export const ACCEL_NORMAL = 8.0;
/** 第一歩での加速度 = ACCEL_NORMAL × FIRST_STEP_BOOST = 11.2 m/s² */

/** 最高速到達の閾値: 目標速度の 95% 到達でスプリント遷移 */
export const SPRINT_THRESHOLD_RATIO = 0.95;

/** 減速時の加速度 (m/s²、絶対値) */
export const DECEL_NORMAL = 10.0;
/** 急減速 (急停止) の加速度 (m/s²、絶対値) */
export const DECEL_HARD = 15.0;

/** "減速" 判定の速度低下閾値 (前フレーム比) */
export const DECEL_SPEED_DROP_THRESHOLD = 0.85;

// =========================================================================
// フェーズ判定 / 遷移
// =========================================================================

/**
 * 現在の速度と目標速度から、適切な MotionPhase を推定。
 */
export function determinePhase(
  currentSpeed: number,
  prevSpeed: number,
  targetSpeed: number,
): MotionPhase {
  const stoppedThreshold = 0.1;
  if (currentSpeed < stoppedThreshold && targetSpeed < stoppedThreshold) {
    return 'idle';
  }
  // 目標速度 0 または現速が前フレーム比で大きく落ちた → 減速
  if (targetSpeed < currentSpeed * DECEL_SPEED_DROP_THRESHOLD) {
    return 'decel';
  }
  // 目標速度の 95% 到達 → スプリント
  if (currentSpeed >= targetSpeed * SPRINT_THRESHOLD_RATIO) {
    return 'sprint';
  }
  return 'accel';
}

// =========================================================================
// 速度推移計算
// =========================================================================

/**
 * 1 フレームの速度更新。
 * @returns 新しい速度 (m/s)
 */
export function stepMotionSpeed(
  currentSpeed: number,
  targetSpeed: number,
  phase: MotionPhase,
  phaseTimer: number,
  dt: number,
): number {
  switch (phase) {
    case 'idle':
      return targetSpeed > 0.1 ? Math.min(targetSpeed, ACCEL_NORMAL * dt) : 0;
    case 'accel': {
      // 第一歩ブースト期間中は加速度を上げる
      const boost = phaseTimer < FIRST_STEP_DURATION ? FIRST_STEP_BOOST : 1.0;
      const accel = ACCEL_NORMAL * boost;
      return Math.min(currentSpeed + accel * dt, targetSpeed);
    }
    case 'sprint':
      // 微調整のみ (目標速度に漸近)
      return targetSpeed;
    case 'decel': {
      const decel = currentSpeed > 5.0 ? DECEL_HARD : DECEL_NORMAL;
      return Math.max(0, currentSpeed - decel * dt);
    }
  }
}

// =========================================================================
// SimMover との統合ヘルパー
// =========================================================================

/**
 * SimMover に motionPhase / phaseTimer を埋め込んで管理するためのラッパー。
 * 既存 SimMover を直接拡張せず、副次的なステートとして扱う想定。
 * (Phase H.1 では SimMover への field 追加を最小限に留め、将来必要なら拡張)
 */
export interface MotionTrackingState {
  phase: MotionPhase;
  phaseTimer: number;
}

export function makeMotionTrackingState(): MotionTrackingState {
  return { phase: 'idle', phaseTimer: 0 };
}

/**
 * フレーム毎に motion state を更新。
 * 既存の moveWithFacing 等の "後" に呼ぶ。
 */
export function updateMotionState(
  state: MotionTrackingState,
  mover: SimMover,
  targetSpeed: number,
  dt: number,
): void {
  const newPhase = determinePhase(mover.lastSpeed, mover.prevSpeed, targetSpeed);
  if (newPhase !== state.phase) {
    state.phase = newPhase;
    state.phaseTimer = 0;
  } else {
    state.phaseTimer += dt;
  }
}

/**
 * 第一歩のブースト係数を取得。
 * 既存の SPRINT_COOLDOWN 等と組み合わせて移動速度に乗算する想定。
 */
export function getFirstStepBoost(state: MotionTrackingState): number {
  if (state.phase === 'accel' && state.phaseTimer < FIRST_STEP_DURATION) {
    // 線形減衰: 0s で 1.4x、0.2s で 1.0x
    const t = state.phaseTimer / FIRST_STEP_DURATION;
    return FIRST_STEP_BOOST - (FIRST_STEP_BOOST - 1.0) * t;
  }
  return 1.0;
}

/**
 * 急減速中で次の動作が遅れるか判定。
 * バランス値と合わせて、ドリブルムーブの「効く瞬間」検知に使う。
 */
export function isRecovering(state: MotionTrackingState, mover: SimMover): boolean {
  if (state.phase !== 'decel') return false;
  // バランスがまだ崩れていれば回復中
  return mover.balance < 0.7;
}
