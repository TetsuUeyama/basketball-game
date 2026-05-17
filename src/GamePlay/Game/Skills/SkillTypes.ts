/**
 * SkillTypes — 個人スキルの共通型定義
 *
 * Phase H.2: 個人スキルライブラリ
 * 各スキル (ドリブル / フィニッシュ / カット / フットワーク) は
 * 共通の Skill インターフェースを実装し、Registry で選択される。
 */

import type { SimMover } from "../Types/TrackingSimTypes";

export type SkillCategory = 'dribble' | 'finish' | 'cut' | 'footwork';

/**
 * スキル評価用のコンテキスト。スキル種別ごとに必要なフィールドが異なるが、
 * 共通の基本情報を提供する。
 */
export interface SkillContext {
  /** スキル実行者 */
  actor: SimMover;
  /** 最寄りディフェンダー (なければ null) */
  nearestDefender: SimMover | null;
  /** ディフェンダーまでの距離 (m) */
  nearestDefenderDist: number;
  /** 攻撃ゴール座標 */
  goalX: number;
  goalZ: number;
  /** ショットクロック残り秒 (undefined なら未考慮) */
  shotClockRemaining?: number;
  /** シミュレーション累積時間 (秒) */
  simTime: number;
}

/**
 * スキルの発火スコアと実行パラメータ。
 */
export interface SkillEvaluation {
  /** 発火適合度 0..1 (大きいほど効く) */
  triggerScore: number;
  /** 推奨実行パラメータ (スキル種別ごとに異なる) */
  executionParams?: Record<string, unknown>;
}

/**
 * スキルの基本インターフェース。
 * 各スキルは triggerScore で発火適合度を返し、最高スコアのスキルが選ばれる。
 */
export interface Skill {
  readonly id: string;
  readonly category: SkillCategory;
  /** 表示名 */
  readonly displayName: string;
  /**
   * 現在のコンテキストでこのスキルを発火すべき適合度を返す。
   * 0 = 不適 (発火しない)、1 = 完全適合。
   */
  evaluate(ctx: SkillContext): SkillEvaluation;
}

/** スキル選択結果 */
export interface SkillSelection {
  skill: Skill;
  score: number;
  params?: Record<string, unknown>;
}
