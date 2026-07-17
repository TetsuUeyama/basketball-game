/**
 * SimState — シミュレーション全体の状態。
 *
 * 全てプレーンなデータ構造体（Babylon 非依存・シリアライズ可能）。
 * View 層は SimState を読むだけで、書き換えは Sim 層のみが行う。
 */

import type { Rng } from './Random';
import { mulberry32 } from './Random';
import type { SimEvent } from './SimEvents';
import type { BaseMap, PatrolRoute } from '../Map/MapTypes';
import type { SoundEvent } from '../Perception/Hearing';
import type { VisionMemory } from '../Perception/Vision';
import { makeVisionMemory } from '../Perception/Vision';
import { angleOf } from './MathUtils';
import { SOLDIER, INTRUDER, AGENT_RADIUS } from '../Config/AgentConfig';

export type SoldierFsmState = 'PATROL' | 'SUSPICIOUS' | 'SEARCH' | 'COMBAT';
export type IntruderKind = 'spy' | 'ninja' | 'squad';
export type MoveMode = 'sneak' | 'walk' | 'run';
export type IntruderPhase =
  | 'infiltrate'   // 侵入 → 目標へ向かう
  | 'exfiltrate'   // 目標達成 → 離脱地点へ
  | 'fight'        // 交戦（Phase 4）
  | 'flee'         // 逃走（Phase 4）
  | 'done';        // 離脱完了

export interface AgentBase {
  id: number;
  x: number;
  z: number;
  /** 体の向き（+Z基準rad） */
  facing: number;
  /** 首（視線）の向き */
  neckFacing: number;
  hp: number;
  alive: boolean;
  radius: number;
  weight: number;
  /** 足音タイマー（次の足音までの残り秒） */
  footstepTimer: number;
}

export interface Soldier extends AgentBase {
  kind: 'soldier';
  fsm: { state: SoldierFsmState; enteredAt: number };
  /** 疑念 0..1+。閾値で FSM 遷移（Phase 3） */
  suspicion: number;
  /** 最後の手掛かり（音・無線・目撃喪失地点） */
  stimulus: { x: number; z: number; time: number } | null;
  route: PatrolRoute;
  routeIdx: number;
  /** pingpong 用の進行方向 */
  routeDir: 1 | -1;
  /** ウェイポイント待機の終了時刻 */
  waitUntil: number;
  /** 待機明けにルートインデックスを進める予約（待機中の lookAngle は到達地点のものを使うため） */
  pendingAdvance: boolean;
  visionMemory: VisionMemory;
  /** 現在視認中の侵入者ID（立ち上がり/立ち下がり検出用） */
  visibleIntruders: Set<number>;
  weapon: { nextFireAt: number };
}

export interface Intruder extends AgentBase {
  kind: IntruderKind;
  phase: IntruderPhase;
  moveMode: MoveMode;
  carryingIntel: boolean;
  /** 侵入経路（Phase 4 で A* 動的経路に置換予定。現状はスクリプト固定） */
  path: { x: number; z: number }[];
  pathIdx: number;
  /** 侵入者自身の視界による警備側の学習（全知にしない） */
  knownThreats: VisionMemory;
}

export interface SecurityCamera {
  id: number;
  x: number;
  z: number;
  /** レンズの向き（+Z基準rad） */
  facing: number;
  /** 首振り設定。null なら固定 */
  sweep: { center: number; halfArc: number; speed: number; dir: 1 | -1 } | null;
  disabled: boolean;
  visibleIntruders: Set<number>;
}

export interface SimState {
  time: number;
  tick: number;
  seed: number;
  rng: Rng;
  map: BaseMap;
  soldiers: Soldier[];
  intruders: Intruder[];
  cameras: SecurityCamera[];
  sounds: SoundEvent[];
  events: SimEvent[];
  outcome: { winner: 'intruder' | 'defender'; reason: string; time: number } | null;
  timeLimitSec: number;
  nextSoundId: number;
}

// =========================================================================
// セットアップ（配置フェーズの出力 = この構造。Phase 5 で UI から生成）
// =========================================================================

export interface SoldierSpawn {
  x: number;
  z: number;
  route: PatrolRoute;
}

export interface IntruderSpawn {
  kind: IntruderKind;
  x: number;
  z: number;
  path: { x: number; z: number }[];
  moveMode: MoveMode;
}

export interface CameraSpawn {
  x: number;
  z: number;
  facing: number;
  sweep?: { halfArc: number; speed: number };
}

export interface SimSetup {
  seed: number;
  map: BaseMap;
  soldiers: SoldierSpawn[];
  intruders: IntruderSpawn[];
  cameras: CameraSpawn[];
  timeLimitSec: number;
}

export function createSimState(setup: SimSetup): SimState {
  let nextId = 1;

  const soldiers: Soldier[] = setup.soldiers.map((s) => {
    // 初期向きは最初のウェイポイント方向
    const p0 = s.route.points[0];
    const facing = p0 ? angleOf(p0.x - s.x, p0.z - s.z) : 0;
    return {
      id: nextId++,
      kind: 'soldier',
      x: s.x,
      z: s.z,
      facing,
      neckFacing: facing,
      hp: SOLDIER.hp,
      alive: true,
      radius: AGENT_RADIUS,
      weight: SOLDIER.weight,
      footstepTimer: 0,
      fsm: { state: 'PATROL', enteredAt: 0 },
      suspicion: 0,
      stimulus: null,
      route: s.route,
      routeIdx: 0,
      routeDir: 1,
      waitUntil: 0,
      pendingAdvance: false,
      visionMemory: makeVisionMemory(),
      visibleIntruders: new Set(),
      weapon: { nextFireAt: 0 },
    };
  });

  const intruders: Intruder[] = setup.intruders.map((s) => {
    const p0 = s.path[0];
    const facing = p0 ? angleOf(p0.x - s.x, p0.z - s.z) : 0;
    return {
      id: nextId++,
      kind: s.kind,
      x: s.x,
      z: s.z,
      facing,
      neckFacing: facing,
      hp: INTRUDER.hp,
      alive: true,
      radius: AGENT_RADIUS,
      weight: INTRUDER.weight,
      footstepTimer: 0,
      phase: 'infiltrate',
      moveMode: s.moveMode,
      carryingIntel: false,
      path: s.path,
      pathIdx: 0,
      knownThreats: makeVisionMemory(),
    };
  });

  const cameras: SecurityCamera[] = setup.cameras.map((c) => ({
    id: nextId++,
    x: c.x,
    z: c.z,
    facing: c.facing,
    sweep: c.sweep
      ? { center: c.facing, halfArc: c.sweep.halfArc, speed: c.sweep.speed, dir: 1 }
      : null,
    disabled: false,
    visibleIntruders: new Set(),
  }));

  return {
    time: 0,
    tick: 0,
    seed: setup.seed,
    rng: mulberry32(setup.seed),
    map: setup.map,
    soldiers,
    intruders,
    cameras,
    sounds: [],
    events: [],
    outcome: null,
    timeLimitSec: setup.timeLimitSec,
    nextSoundId: 1,
  };
}
