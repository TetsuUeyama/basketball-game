/**
 * SchemeTypes — チーム戦術 (オフェンス/ディフェンス) の共通型定義
 *
 * Phase H.3: チーム戦術システム
 *  - オフェンス: モーション / セットプレー
 *  - ディフェンス: スキーム + PnR coverage + ゾーン
 *  - トランジション: 攻撃/守備
 *
 * 各スキームは "tick(state, dt)" でフレームごとに各プレイヤーに目的地・優先度を配る。
 */

import type { SimState, SimMover } from "../Types/TrackingSimTypes";

export type SchemeKind = 'offense' | 'defense' | 'transition';

/**
 * プレイヤーへの指示。スキームは各プレイヤーに 0 個以上の指示を出す。
 */
export interface PlayerInstruction {
  /** 対象プレイヤーの絶対インデックス (0-9) */
  entityIdx: number;
  /** 目的座標。null なら維持 */
  dest: { x: number; z: number } | null;
  /** スピード倍率 (1.0 = 通常) */
  speedMult: number;
  /** 指示の優先度。高いほど他の指示より優先 */
  priority: number;
  /** デバッグ用ラベル */
  label?: string;
}

/**
 * スキーム実行の入力コンテキスト。
 */
export interface SchemeContext {
  state: SimState;
  /** シミュレーション時間 (秒) */
  simTime: number;
  /** ショットクロック残り (秒) */
  shotClockRemaining: number;
  /** ポゼッション開始からの経過時間 (秒) */
  possessionAge: number;
}

/**
 * スキーム評価結果。
 */
export interface SchemeResult {
  /** 各プレイヤーへの指示 (空配列なら無干渉) */
  instructions: PlayerInstruction[];
  /** スキームの完了フラグ (true なら次フレームで別スキームに切替推奨) */
  completed: boolean;
}

/**
 * スキームのベース。tick で指示を生成する。
 */
export interface Scheme {
  readonly id: string;
  readonly kind: SchemeKind;
  readonly displayName: string;
  /**
   * このフレームでスキームを開始すべき適合度。
   * SchemeSelector はこの値で次のスキームを選ぶ。
   */
  evaluateActivation(ctx: SchemeContext): number;
  /**
   * 1 フレームの実行。指示を返す。
   */
  tick(ctx: SchemeContext): SchemeResult;
  /**
   * スキームをリセット (新規ポゼッション開始時など)。
   */
  reset?(): void;
}

// =========================================================================
// ヘルパー
// =========================================================================

/** ロール番号 (0-4) から絶対インデックスを取得 */
export function getOffenseAbsIdx(state: SimState, relIdx: number): number {
  return state.offenseBase + relIdx;
}

export function getDefenseAbsIdx(state: SimState, relIdx: number): number {
  return state.defenseBase + relIdx;
}

/** オフェンス全プレイヤー (PG, SG, SF, C, PF の順) */
export function getOffensePlayers(state: SimState): SimMover[] {
  return [state.launcher, ...state.targets];
}
