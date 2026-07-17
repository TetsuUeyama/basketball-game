/**
 * DefenderBehaviors — 警戒FSM各状態の具体的な行動。
 *
 * SUSPICIOUS: 刺激方向を凝視 → stareSec 後に調査速度で接近
 * SEARCH: 捜索基点へ移動 → 到着後は基点周辺を徘徊しつつ首を振って索敵
 * COMBAT: 射程の chaseStopRatio まで詰めて射撃（Engagement）
 */

import type { SimState, Soldier, Intruder } from '../Core/SimState';
import { angleOf, dirX, dirZ, dist2d } from '../Core/MathUtils';
import { moveTowards, turnToward, turnNeckToward } from '../Movement/MovementCore';
import { tryShoot } from '../Combat/Engagement';
import { SOLDIER, WAYPOINT_ARRIVE_DIST } from '../Config/AgentConfig';
import { ALERT } from '../Config/AlertConfig';

/** 体と首を指定座標方向へ回す */
export function faceToward(s: Soldier, x: number, z: number, dt: number): void {
  const ang = angleOf(x - s.x, z - s.z);
  s.facing = turnToward(s.facing, ang, SOLDIER.turnRate * dt);
  s.neckFacing = turnNeckToward(
    s.facing, s.neckFacing, ang,
    SOLDIER.neckTurnRate * dt, SOLDIER.neckMaxAngle,
  );
}

/** SUSPICIOUS: 凝視 → 接近調査。移動量を返す */
export function behaveSuspicious(state: SimState, s: Soldier, dt: number): number {
  const st = s.stimulus;
  if (!st) return 0;

  faceToward(s, st.x, st.z, dt);

  // まず凝視（刺激の発生 or 状態突入から stareSec）
  const stareStart = Math.max(st.time, s.fsm.enteredAt);
  if (state.time - stareStart < SOLDIER.investigate.stareSec) return 0;

  // 接近調査
  if (dist2d(s.x, s.z, st.x, st.z) > SOLDIER.investigate.stopDist) {
    const r = moveTowards(
      s, st.x, st.z,
      SOLDIER.investigateSpeed, SOLDIER.turnRate, dt,
      state.map, s.radius, SOLDIER.investigate.stopDist,
    );
    // 移動中も視線は刺激へ
    s.neckFacing = turnNeckToward(
      s.facing, s.neckFacing, angleOf(st.x - s.x, st.z - s.z),
      SOLDIER.neckTurnRate * dt, SOLDIER.neckMaxAngle,
    );
    return r.moved;
  }
  return 0;
}

/** SEARCH: 基点へ移動 → 周辺徘徊＋首振り索敵。移動量を返す */
export function behaveSearch(state: SimState, s: Soldier, dt: number): number {
  const anchor = s.searchAnchor;
  if (!anchor) return 0;

  let moved = 0;
  if (dist2d(s.x, s.z, anchor.x, anchor.z) > SOLDIER.search.wanderRadius * 0.5) {
    // 基点へ向かう（移動中は捜索打ち切りタイマーを進めない —
    // 遠方からの収束中に give-up して引き返すのを防ぐ）
    s.searchUntil = state.time + ALERT.searchGiveUpSec;
    s.wanderTarget = null;
    moved = moveTowards(
      s, anchor.x, anchor.z,
      SOLDIER.investigateSpeed, SOLDIER.turnRate, dt,
      state.map, s.radius, WAYPOINT_ARRIVE_DIST,
    ).moved;
  } else {
    // 基点周辺を徘徊（目標はシードRNGで選ぶ = 決定論維持）
    if (
      !s.wanderTarget ||
      dist2d(s.x, s.z, s.wanderTarget.x, s.wanderTarget.z) <= WAYPOINT_ARRIVE_DIST
    ) {
      const a = state.rng() * Math.PI * 2;
      const r = 2 + state.rng() * (SOLDIER.search.wanderRadius - 2);
      s.wanderTarget = { x: anchor.x + dirX(a) * r, z: anchor.z + dirZ(a) * r };
    }
    moved = moveTowards(
      s, s.wanderTarget.x, s.wanderTarget.z,
      SOLDIER.investigateSpeed, SOLDIER.turnRate, dt,
      state.map, s.radius, WAYPOINT_ARRIVE_DIST,
    ).moved;
  }

  // 首振り索敵（sim時間ベースの正弦スイープ = 決定論）
  const sweep = Math.sin(state.time * 1.7 + s.id) * SOLDIER.neckMaxAngle;
  s.neckFacing = turnNeckToward(
    s.facing, s.neckFacing, s.facing + sweep,
    SOLDIER.neckTurnRate * dt, SOLDIER.neckMaxAngle,
  );
  return moved;
}

/** COMBAT: 追跡＋射撃。移動量を返す */
export function engageTarget(state: SimState, s: Soldier, target: Intruder, dt: number): number {
  faceToward(s, target.x, target.z, dt);

  let moved = 0;
  const dist = dist2d(s.x, s.z, target.x, target.z);
  if (dist > SOLDIER.weapon.range * SOLDIER.combat.chaseStopRatio) {
    moved = moveTowards(
      s, target.x, target.z,
      SOLDIER.combatSpeed, SOLDIER.turnRate, dt,
      state.map, s.radius, WAYPOINT_ARRIVE_DIST,
    ).moved;
  }
  tryShoot(state, s, target);
  return moved;
}
