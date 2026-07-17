/**
 * PatrolFollower — 巡回ルートの追従。
 *
 * ウェイポイントへ移動 → 到達したら waitSec 待機（lookAngle があればその方向を向く）
 * → 次のポイントへ。mode: cycle（循環）/ pingpong（往復）。
 * 移動中の首（neckFacing）は進行方向に追従。待機中は lookAngle へ。
 */

import type { Soldier } from '../Core/SimState';
import type { BaseMap } from '../Map/MapTypes';
import { moveTowards, turnToward, turnNeckToward } from './MovementCore';
import { SOLDIER, WAYPOINT_ARRIVE_DIST } from '../Config/AgentConfig';

export function updatePatrol(
  soldier: Soldier,
  map: BaseMap,
  time: number,
  dt: number,
): { moved: number } {
  const route = soldier.route;
  if (route.points.length === 0) return { moved: 0 };

  // 待機中: 到達地点（現インデックス）の lookAngle を向いて警戒
  if (time < soldier.waitUntil) {
    const wpHere = route.points[soldier.routeIdx];
    const look = wpHere.lookAngle !== undefined ? wpHere.lookAngle : soldier.facing;
    soldier.facing = turnToward(soldier.facing, look, SOLDIER.turnRate * dt);
    soldier.neckFacing = turnNeckToward(
      soldier.facing, soldier.neckFacing, look,
      SOLDIER.neckTurnRate * dt, SOLDIER.neckMaxAngle,
    );
    return { moved: 0 };
  }

  // 待機明け: ここで初めて次のウェイポイントへ進める
  if (soldier.pendingAdvance) {
    soldier.pendingAdvance = false;
    advanceRouteIndex(soldier);
  }

  const wp = route.points[soldier.routeIdx];
  const result = moveTowards(
    soldier, wp.x, wp.z,
    SOLDIER.patrolSpeed, SOLDIER.turnRate, dt,
    map, soldier.radius, WAYPOINT_ARRIVE_DIST,
  );

  // 移動中は首を進行方向へ戻す
  soldier.neckFacing = turnNeckToward(
    soldier.facing, soldier.neckFacing, soldier.facing,
    SOLDIER.neckTurnRate * dt, SOLDIER.neckMaxAngle,
  );

  if (result.arrived) {
    soldier.waitUntil = time + wp.waitSec;
    soldier.pendingAdvance = true;
  }
  return { moved: result.moved };
}

function advanceRouteIndex(soldier: Soldier): void {
  const n = soldier.route.points.length;
  if (n <= 1) return;
  if (soldier.route.mode === 'cycle') {
    soldier.routeIdx = (soldier.routeIdx + 1) % n;
  } else {
    // pingpong
    let next = soldier.routeIdx + soldier.routeDir;
    if (next >= n || next < 0) {
      soldier.routeDir = (soldier.routeDir * -1) as 1 | -1;
      next = soldier.routeIdx + soldier.routeDir;
    }
    soldier.routeIdx = next;
  }
}
