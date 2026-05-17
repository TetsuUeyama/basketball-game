/**
 * TacticalPriority — 戦術プライオリティマネージャ
 *
 * 毎ポゼッションで「チーム戦術が支配的か / 個人スキルに任せるか / トランジションか」
 * を評価する。Phase H.3 のスキームと Phase H.2 の個人スキルの優先順位制御。
 *
 * リサーチ根拠:
 *  - セットプレー実行中はチーム支配 (基本)
 *  - ショットクロック残り少 / アイソ指定 / ミスマッチ発生で個人支配
 *  - リバウンド直後・ターンオーバー直後はトランジション支配
 */

import type { SimState } from "../Types/TrackingSimTypes";

export type TacticalMode = 'team' | 'individual' | 'transition';

export interface TacticalPriorityInput {
  state: SimState;
  shotClockRemaining: number;
  possessionAge: number;
  /** トランジション中かどうか (offense in transit フラグの集約) */
  inTransition: boolean;
}

export interface TacticalPriorityResult {
  mode: TacticalMode;
  /** 適合度 0..1 (この mode の確信度) */
  confidence: number;
  /** モード選択の根拠 (UI 表示用) */
  reason: string;
}

// =========================================================================
// 評価ルール
// =========================================================================

/** ショットクロック残り何秒から「個人モード」に切り替えるか */
export const INDIVIDUAL_MODE_SHOT_CLOCK_THRESHOLD = 6.0;

/** トランジション継続時間 (秒)。ポゼッション開始からこの時間内はトランジション扱い */
export const TRANSITION_WINDOW_SEC = 4.0;

/**
 * ミスマッチを検出 (オンボール vs マークマンの能力差・身長差)。
 * 簡易実装: 身長差 10cm 以上、もしくは スピード差ありの場合 true。
 */
function detectMismatch(state: SimState): boolean {
  const handler = state.onBallEntityIdx === 0 ? state.launcher : state.targets[state.onBallEntityIdx - 1];
  // 最寄り DF を探す
  let nearestDef = state.obstacles[0];
  let minDist = Infinity;
  for (const ob of state.obstacles) {
    const dx = ob.x - handler.x;
    const dz = ob.z - handler.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < minDist) {
      minDist = d;
      nearestDef = ob;
    }
  }
  // 身長差 10cm 以上
  if (Math.abs(handler.height - nearestDef.height) >= 10) return true;
  // 速度差は ability 未実装のため省略 (Phase H.4.4 で追加可)
  return false;
}

/**
 * 戦術プライオリティを評価して返す。
 */
export function evaluateTacticalPriority(input: TacticalPriorityInput): TacticalPriorityResult {
  // 1. トランジション優先 (ポゼッション開始 4 秒以内 + トランジット中)
  if (input.inTransition && input.possessionAge < TRANSITION_WINDOW_SEC) {
    return {
      mode: 'transition',
      confidence: 0.9,
      reason: `Transition (possession age ${input.possessionAge.toFixed(1)}s)`,
    };
  }

  // 2. 個人モード優先 (ショットクロック残り少 or ミスマッチ)
  if (input.shotClockRemaining < INDIVIDUAL_MODE_SHOT_CLOCK_THRESHOLD) {
    return {
      mode: 'individual',
      confidence: 0.95,
      reason: `Shot clock urgency (${input.shotClockRemaining.toFixed(1)}s)`,
    };
  }
  if (detectMismatch(input.state)) {
    return {
      mode: 'individual',
      confidence: 0.7,
      reason: 'Mismatch detected (height diff ≥10cm)',
    };
  }

  // 3. デフォルト: チーム戦術モード
  return {
    mode: 'team',
    confidence: 0.8,
    reason: `Team scheme (clock ${input.shotClockRemaining.toFixed(1)}s)`,
  };
}
