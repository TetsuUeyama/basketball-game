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
  /** SUSPICIOUS: 刺激方向を凝視してから接近調査へ移る */
  investigate: {
    stareSec: 0.8,
    stopDist: 1.5,
  },
  /** SEARCH: 最終目撃地点周辺の徘徊捜索 */
  search: {
    wanderRadius: 6,
  },
  /** COMBAT */
  combat: {
    /** 見失ってから SEARCH へ落ちるまでの秒数 */
    lostTargetSec: 3.0,
    /** 射程 × この係数より遠ければ追跡で詰める */
    chaseStopRatio: 0.75,
    /** 発砲に必要な照準許容角 */
    aimTolerance: degToRad(12),
    /** 命中率 = clamp(base - falloff × 距離/射程, min, base) */
    accuracyBase: 0.85,
    accuracyFalloff: 0.55,
    accuracyMin: 0.2,
    /** 走っている標的への命中率倍率（全力疾走は狙いにくい） */
    runTargetMult: 0.6,
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
  /** 隠密行動（脅威コーンの回避） */
  stealth: {
    /** 進行方向の先読み距離 (m) — この先がコーン内なら待機 */
    lookaheadDist: 1.2,
    /** コーン判定の距離マージン (m) */
    coneMarginDist: 1.5,
    /** コーン判定の角度マージン */
    coneMarginAngle: degToRad(8),
    /** 忍び足に切り替える「コーンに近い」判定の追加マージン */
    sneakMarginDist: 4,
    sneakMarginAngle: degToRad(25),
    /** 待機がこの秒数を超えたら強行突破（走り抜け）に切り替え（カメラ等の固定脅威向け） */
    holdTimeoutSec: 6,
    /** 兵士のコーンに塞がれている場合の待機上限（巡回1周期を待てる長さ） */
    soldierHoldTimeoutSec: 30,
    /** 強行突破の継続秒数 */
    dashSec: 2.5,
    /** COMBAT状態の兵士がこの距離内に見えたら逃走へ */
    fleeCombatDist: 22,
    /** この距離内の兵士にコーンで塞がれたら凍結せず距離を取る */
    retreatDist: 10,
    /** 逃走中、この秒数脅威を感じなければ任務を再開する（機密未入手の場合のみ） */
    resumeAfterCalmSec: 12,
    /** HPがこの割合以下なら任務続行を諦めて本当に撤退する */
    woundedRetreatHpRatio: 0.35,
  },
} as const;

/** ウェイポイント到達判定距離 (m) */
export const WAYPOINT_ARRIVE_DIST = 0.5;
