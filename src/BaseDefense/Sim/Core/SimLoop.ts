/**
 * SimLoop — シミュレーションの毎tick更新オーケストレータ。
 *
 * 順序: エンティティ行動（兵士巡回/カメラ首振り/侵入者計画）
 *     → 重なり分離 → 知覚判定 → 音の寿命処理 → 勝敗判定。
 * Babylon 非依存。View からもヘッドレスハーネスからも同じ関数を呼ぶ。
 */

import type { SimState, Intruder } from './SimState';
import { pushEvent } from './SimEvents';
import { dist2d } from './MathUtils';
import { normAngleDiff } from './MathUtils';
import { updatePatrol } from '../Movement/PatrolFollower';
import { moveTowards, turnNeckToward } from '../Movement/MovementCore';
import { separateAgents } from '../Movement/MovementCore';
import { updatePerception, emitFootsteps } from '../Perception/PerceptionUpdate';
import { checkWinLose } from '../Rules/WinLose';
import { INTRUDER, SOLDIER, WAYPOINT_ARRIVE_DIST } from '../Config/AgentConfig';

/** 目標（機密）の取得判定距離 (m) */
const OBJECTIVE_REACH_DIST = 1.2;

export function updateSim(state: SimState, dt: number): void {
  if (state.outcome) return;
  state.time += dt;
  state.tick++;

  // ---- 兵士: 巡回（Phase 3 で FSM ディスパッチに置換） ----
  for (const s of state.soldiers) {
    if (!s.alive) continue;
    const { moved } = updatePatrol(s, state.map, state.time, dt);
    emitFootsteps(state, s, 'walk', moved, dt);
  }

  // ---- 監視カメラ: 首振り ----
  for (const c of state.cameras) {
    if (c.disabled || !c.sweep) continue;
    c.facing += c.sweep.speed * c.sweep.dir * dt;
    const rel = normAngleDiff(c.sweep.center, c.facing);
    if (rel > c.sweep.halfArc) {
      c.facing = c.sweep.center + c.sweep.halfArc;
      c.sweep.dir = -1;
    } else if (rel < -c.sweep.halfArc) {
      c.facing = c.sweep.center - c.sweep.halfArc;
      c.sweep.dir = 1;
    }
  }

  // ---- 侵入者: スクリプト経路の実行 ----
  for (const i of state.intruders) {
    if (!i.alive || i.phase === 'done') continue;
    updateIntruder(state, i, dt);
  }

  // ---- 重なり分離 ----
  const aliveAgents = [
    ...state.soldiers.filter((s) => s.alive),
    ...state.intruders.filter((i) => i.alive && i.phase !== 'done'),
  ];
  separateAgents(aliveAgents, state.map);

  // ---- 知覚 ----
  updatePerception(state, dt);

  // ---- 音の寿命処理 ----
  if (state.sounds.length > 0) {
    state.sounds = state.sounds.filter((snd) => snd.expiresAt > state.time);
  }

  // ---- 勝敗 ----
  checkWinLose(state);
}

function updateIntruder(state: SimState, i: Intruder, dt: number): void {
  if (i.path.length === 0) return;
  const wp = i.path[Math.min(i.pathIdx, i.path.length - 1)];
  const speed = INTRUDER.speed[i.moveMode];

  const result = moveTowards(
    i, wp.x, wp.z,
    speed, INTRUDER.turnRate, dt,
    state.map, i.radius, WAYPOINT_ARRIVE_DIST,
  );
  // 首は進行方向へ（周囲警戒の首振りは後続Phase）
  i.neckFacing = turnNeckToward(
    i.facing, i.neckFacing, i.facing,
    SOLDIER.neckTurnRate * dt, SOLDIER.neckMaxAngle,
  );
  emitFootsteps(state, i, i.moveMode, result.moved, dt);

  if (result.arrived && i.pathIdx < i.path.length - 1) {
    i.pathIdx++;
  }

  // 機密の奪取
  if (
    i.phase === 'infiltrate' &&
    dist2d(i.x, i.z, state.map.objective.x, state.map.objective.z) <= OBJECTIVE_REACH_DIST
  ) {
    i.carryingIntel = true;
    i.phase = 'exfiltrate';
    pushEvent(state.events, {
      time: state.time,
      kind: 'objective_taken',
      actorId: i.id,
      x: i.x,
      z: i.z,
    });
  }

  // 離脱
  if (i.phase === 'exfiltrate') {
    for (const zone of state.map.exfilZones) {
      if (dist2d(i.x, i.z, zone.x, zone.z) <= zone.r) {
        i.phase = 'done';
        pushEvent(state.events, {
          time: state.time,
          kind: 'exfil',
          actorId: i.id,
          x: i.x,
          z: i.z,
        });
        break;
      }
    }
  }
}
