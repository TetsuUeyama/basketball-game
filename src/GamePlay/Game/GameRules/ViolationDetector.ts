/**
 * ViolationDetector — バイオレーション検知 (3秒・8秒バックコート)
 *
 * - 3秒ルール: オフェンス選手がペイント内に 3 秒以上滞在
 * - 8秒バックコート: ポゼッション取得から 8 秒以内に半コートを越えなければ違反
 *
 * 本格的なトラベリング/5秒/ダブルドリブル等は未実装。
 */

import { PAINT_HALF_WIDTH, PAINT_DEPTH, HALFCOURT_Z } from "../Config/GoalConfig";
import { SIM_FIELD_Z_HALF } from "../Config/FieldConfig";

export const THREE_SECOND_LIMIT = 3.0;
export const BACKCOURT_LIMIT = 8.0;

export interface ViolationState {
  /** 各オフェンスプレイヤー（offense 相対 0-4）の現在のペイント滞在時間 */
  paintTimePerOffense: number[];
  /** ポゼッション取得後、バックコートで経過した時間 */
  backcourtTimer: number;
  /** フロントコートに入ったか (一度入ったら戻れない = backcourt violation の前段) */
  hasCrossedHalfcourt: boolean;
}

export function makeInitialViolationState(): ViolationState {
  return {
    paintTimePerOffense: [0, 0, 0, 0, 0],
    backcourtTimer: 0,
    hasCrossedHalfcourt: false,
  };
}

export interface ViolationCheckResult {
  /** 3秒バイオレーションが発生した相対オフェンスインデックス (-1 = 無し) */
  threeSecondViolatorRelIdx: number;
  /** 8秒バックコートバイオレーション発生 */
  backcourtViolation: boolean;
  /** ハーフコート越え (このフレームで初めて越えた場合 true) */
  halfcourtCrossed: boolean;
}

/**
 * オフェンスの全プレイヤー位置から ViolationState を更新し、違反があれば検知。
 * @param state 既存の ViolationState (mutate される)
 * @param offensePositions [PG, SG, SF, C, PF] の座標
 * @param onBallEntityRelIdx ボール保持者 (0-4 オフェンス相対)
 * @param attackGoalZ 攻撃ゴール Z 座標（ペイント方向判定用）
 * @param dt フレーム時間
 */
export function tickViolations(
  state: ViolationState,
  offensePositions: { x: number; z: number }[],
  onBallEntityRelIdx: number,
  attackGoalZ: number,
  dt: number,
): ViolationCheckResult {
  const result: ViolationCheckResult = {
    threeSecondViolatorRelIdx: -1,
    backcourtViolation: false,
    halfcourtCrossed: false,
  };

  // --- 3秒ルール ---
  const goalSide: 1 | -1 = attackGoalZ > 0 ? 1 : -1;
  for (let i = 0; i < offensePositions.length; i++) {
    const p = offensePositions[i];
    const inPaint = isInPaintForGoal(p.x, p.z, goalSide);
    if (inPaint) {
      state.paintTimePerOffense[i] += dt;
      if (state.paintTimePerOffense[i] >= THREE_SECOND_LIMIT && result.threeSecondViolatorRelIdx === -1) {
        result.threeSecondViolatorRelIdx = i;
      }
    } else {
      state.paintTimePerOffense[i] = 0;
    }
  }

  // --- 8秒バックコート ---
  // ボール保持者の位置で判定
  if (onBallEntityRelIdx >= 0 && onBallEntityRelIdx < offensePositions.length) {
    const ballHolderZ = offensePositions[onBallEntityRelIdx].z;
    const inFrontcourt = goalSide === 1 ? ballHolderZ > HALFCOURT_Z : ballHolderZ < HALFCOURT_Z;

    if (inFrontcourt) {
      if (!state.hasCrossedHalfcourt) {
        result.halfcourtCrossed = true;
        state.hasCrossedHalfcourt = true;
      }
    } else if (!state.hasCrossedHalfcourt) {
      state.backcourtTimer += dt;
      if (state.backcourtTimer >= BACKCOURT_LIMIT) {
        result.backcourtViolation = true;
      }
    }
  }

  return result;
}

/** ポゼッション交代時に呼ぶ。バックコートタイマー・ハーフコート越えフラグをリセット。 */
export function resetOnPossessionChange(state: ViolationState): void {
  state.backcourtTimer = 0;
  state.hasCrossedHalfcourt = false;
  for (let i = 0; i < state.paintTimePerOffense.length; i++) {
    state.paintTimePerOffense[i] = 0;
  }
}

/**
 * 指定 (x, z) が指定ゴール側のペイント内か判定。
 * GoalConfig.isInPaint と同義だが、循環参照避けと内部実装の都合で再定義。
 */
function isInPaintForGoal(x: number, z: number, goalSide: 1 | -1): boolean {
  if (Math.abs(x) > PAINT_HALF_WIDTH) return false;
  if (goalSide === 1) {
    return z >= SIM_FIELD_Z_HALF - PAINT_DEPTH && z <= SIM_FIELD_Z_HALF;
  } else {
    return z >= -SIM_FIELD_Z_HALF && z <= -(SIM_FIELD_Z_HALF - PAINT_DEPTH);
  }
}
