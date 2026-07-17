/**
 * DefenderFSM — 兵士の警戒状態機械。
 *
 * PATROL → SUSPICIOUS → SEARCH → COMBAT
 *  - エスカレーション（上位への遷移）は即時
 *  - デエスカレーション（復帰）は ALERT.minStateSec の最低滞在＋ヒステリシス閾値
 *    （suspiciousThreshold 0.35 で上がり calmThreshold 0.15 で下がる）でフラッピング防止
 *  - COMBAT 突入時に RadioNet でブロードキャスト → 他兵士が SEARCH で収束
 */

import type { SimState, Soldier, Intruder, SoldierFsmState } from '../Core/SimState';
import { pushEvent } from '../Core/SimEvents';
import { dist2d } from '../Core/MathUtils';
import { recallEntity } from '../Perception/Vision';
import { updatePatrol } from '../Movement/PatrolFollower';
import { moveTowards } from '../Movement/MovementCore';
import { emitFootsteps } from '../Perception/PerceptionUpdate';
import { behaveSuspicious, behaveSearch, engageTarget } from './DefenderBehaviors';
import { broadcast } from './RadioNet';
import { ALERT } from '../Config/AlertConfig';
import { SOLDIER } from '../Config/AgentConfig';
import { VISION_MEMORY_SEC } from '../Config/PerceptionConfig';

export function updateDefender(state: SimState, s: Soldier, dt: number): void {
  const target = pickVisibleTarget(state, s);

  switch (s.fsm.state) {
    case 'PATROL': {
      if (target && s.suspicion >= ALERT.confirmThreshold) {
        enterCombat(state, s, target);
        break;
      }
      if (s.suspicion >= ALERT.suspiciousThreshold) {
        setFsm(state, s, 'SUSPICIOUS');
        break;
      }
      const { moved } = updatePatrol(s, state.map, state.time, dt);
      emitFootsteps(state, s, 'walk', moved, dt);
      break;
    }

    case 'SUSPICIOUS': {
      if (target && s.suspicion >= ALERT.confirmThreshold) {
        enterCombat(state, s, target);
        break;
      }
      if (!target && s.suspicion >= ALERT.confirmThreshold) {
        // 確信はあるが見えていない（無線受信・音の連続など）→ 現地捜索
        toSearch(state, s, s.stimulus);
        break;
      }
      if (s.suspicion <= ALERT.calmThreshold && dwell(state, s) >= ALERT.minStateSec) {
        setFsm(state, s, 'PATROL');
        break;
      }
      const moved = behaveSuspicious(state, s, dt);
      emitFootsteps(state, s, 'walk', moved, dt);
      break;
    }

    case 'SEARCH': {
      if (target) {
        enterCombat(state, s, target);
        break;
      }
      if (state.time >= s.searchUntil && dwell(state, s) >= ALERT.minStateSec) {
        s.suspicion = 0;
        s.searchAnchor = null;
        s.wanderTarget = null;
        setFsm(state, s, 'PATROL');
        break;
      }
      const moved = behaveSearch(state, s, dt);
      emitFootsteps(state, s, 'walk', moved, dt);
      break;
    }

    case 'COMBAT': {
      if (target) {
        s.targetId = target.id;
        s.suspicion = 2;
        const moved = engageTarget(state, s, target, dt);
        emitFootsteps(state, s, 'run', moved, dt);
        break;
      }
      // 見失った → 記憶の最終目撃位置へ。lostTargetSec 超で SEARCH へ落とす
      const mem = s.targetId !== null
        ? recallEntity(s.visionMemory, s.targetId, state.time, VISION_MEMORY_SEC)
        : null;
      if (mem && state.time - mem.lastSeenTime <= SOLDIER.combat.lostTargetSec) {
        const moved = behaveSuspiciousLikeChase(state, s, mem.lastSeenX, mem.lastSeenZ, dt);
        emitFootsteps(state, s, 'run', moved, dt);
        break;
      }
      toSearch(
        state, s,
        mem
          ? { x: mem.lastSeenX, z: mem.lastSeenZ, time: mem.lastSeenTime }
          : s.stimulus,
      );
      break;
    }
  }
}

/** 見失い直後の最終目撃位置への走り込み */
function behaveSuspiciousLikeChase(
  state: SimState, s: Soldier, x: number, z: number, dt: number,
): number {
  const r = moveTowards(
    s, x, z,
    SOLDIER.combatSpeed, SOLDIER.turnRate, dt,
    state.map, s.radius, SOLDIER.investigate.stopDist,
  );
  return r.moved;
}

/** 現在視認中の最も近い生存侵入者 */
function pickVisibleTarget(state: SimState, s: Soldier): Intruder | null {
  let best: Intruder | null = null;
  let bestDist = Infinity;
  for (const id of s.visibleIntruders) {
    const i = state.intruders.find((it) => it.id === id);
    if (!i || !i.alive || i.phase === 'done') continue;
    const d = dist2d(s.x, s.z, i.x, i.z);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function dwell(state: SimState, s: Soldier): number {
  return state.time - s.fsm.enteredAt;
}

function setFsm(state: SimState, s: Soldier, next: SoldierFsmState): void {
  const prev = s.fsm.state;
  if (prev === next) return;
  s.fsm = { state: next, enteredAt: state.time };
  pushEvent(state.events, {
    time: state.time,
    kind: 'fsm_change',
    actorId: s.id,
    x: s.x,
    z: s.z,
    detail: `${prev}->${next}`,
  });
}

function enterCombat(state: SimState, s: Soldier, target: Intruder): void {
  s.targetId = target.id;
  s.suspicion = 2;
  setFsm(state, s, 'COMBAT');
  broadcast(state, s.id, target.x, target.z);
}

function toSearch(
  state: SimState,
  s: Soldier,
  stim: { x: number; z: number; time: number } | null,
): void {
  if (!stim) {
    // 手掛かりが無ければ巡回へ戻る
    s.suspicion = 0;
    setFsm(state, s, 'PATROL');
    return;
  }
  s.searchAnchor = { x: stim.x, z: stim.z };
  s.searchUntil = state.time + ALERT.searchGiveUpSec;
  s.wanderTarget = null;
  setFsm(state, s, 'SEARCH');
}
