/**
 * AgentConfig — 兵士・侵入者の身体・武器パラメータ。
 */

import { degToRad } from '../Core/MathUtils';

/** エージェントの衝突半径 (m) */
export const AGENT_RADIUS = 0.35;

/** エージェント押し離し（重なり分離）時の1フレーム最大押し戻し量 (m) */
export const SEPARATE_MAX_PUSH_PER_PAIR = 0.05;
export const SEPARATE_MAX_PUSH_PER_ENTITY = 0.08;

/** 兵士 */
export const SOLDIER = {
  patrolSpeed: 1.4,     // 巡回歩行 (m/s)
  investigateSpeed: 2.2, // 調査移動
  combatSpeed: 4.0,     // 戦闘走行
  turnRate: degToRad(240),      // 体の旋回速度 (rad/s)
  neckTurnRate: degToRad(360),  // 首の旋回速度
  neckMaxAngle: degToRad(70),   // 体正面からの首の最大振り角
  hp: 100,
  weight: 80,
  weapon: {
    range: 18,
    damage: 34,
    cooldownSec: 0.8,
  },
} as const;

/** 侵入者（タイプ別の詳細差分は IntruderProfiles で上書き — Phase 4） */
export const INTRUDER = {
  speed: {
    sneak: 0.9,
    walk: 1.7,
    run: 4.5,
  },
  turnRate: degToRad(300),
  hp: 80,
  weight: 70,
} as const;

/** ウェイポイント到達判定距離 (m) */
export const WAYPOINT_ARRIVE_DIST = 0.5;
