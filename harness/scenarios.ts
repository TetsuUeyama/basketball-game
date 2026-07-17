/**
 * scenarios — ヘッドレス検証用のシナリオ定義。
 *
 * Sim コアは Babylon 非依存なので、スタブ無しで Node から直接実行できる。
 * 各シナリオは SimSetup を返す。検証は run-sim.ts が行う。
 */

import type { BaseMap } from '../src/BaseDefense/Sim/Map/MapTypes';
import type { SimSetup } from '../src/BaseDefense/Sim/Core/SimState';
import { angleOf } from '../src/BaseDefense/Sim/Core/MathUtils';

const NORTH = angleOf(0, 1);

/** 壁なしの平地マップ。objective/exfil はテストの邪魔にならない隅へ */
export function emptyMap(): BaseMap {
  return {
    width: 60,
    depth: 40,
    walls: [],
    doors: [],
    objective: { x: -28, z: -18 },
    exfilZones: [{ x: 28, z: -18, r: 1.0 }],
    intruderSpawns: [{ x: 0, z: -18 }],
  };
}

/** 兵士が1点に立って北(+Z)を注視するルート */
function standingGuard(x: number, z: number, lookAngle: number) {
  return {
    x,
    z,
    route: {
      mode: 'cycle' as const,
      points: [{ x, z, waitSec: 9999, lookAngle }],
    },
  };
}

/**
 * シナリオ1: コーン横断。
 * 兵士(0,0)が北を注視。侵入者が (-15,8)→(15,8) を歩いて横断する。
 * 期待: 必ず視認される（中心視野 範囲22m・半角30°を z=8 で横断する）。
 */
export function scenarioCrossCone(seed: number): SimSetup {
  return {
    seed,
    map: emptyMap(),
    timeLimitSec: 60,
    soldiers: [standingGuard(0, 0, NORTH)],
    cameras: [],
    intruders: [
      {
        kind: 'spy',
        x: -15,
        z: 8,
        moveMode: 'walk',
        path: [{ x: 15, z: 8 }],
      },
    ],
  };
}

/**
 * シナリオ2: 壁裏の横断。
 * シナリオ1と同じだが、兵士と横断ラインの間に視線遮蔽壁 (-20,4)-(20,4)。
 * 期待: 視認 0 件。
 */
export function scenarioBehindWall(seed: number): SimSetup {
  const map = emptyMap();
  map.walls.push({
    x1: -20, z1: 4, x2: 20, z2: 4,
    blocksVision: true, blocksMove: true, height: 3,
  });
  return {
    ...scenarioCrossCone(seed),
    map,
  };
}

/**
 * シナリオ3: 聴覚。
 * 兵士(0,0)。侵入者が z=10 のライン（背後 = 南向き注視の視界外）を移動。
 * moveMode を変えて期待値を切り替える:
 *  - run  (半径13m): z=10 < 13 → 聴取される
 *  - walk (半径5m):  z=10 > 5  → 聴取されない
 *  - sneak(無音):    聴取されない
 */
export function scenarioHearing(seed: number, moveMode: 'sneak' | 'walk' | 'run'): SimSetup {
  const SOUTH = angleOf(0, -1);
  return {
    seed,
    map: emptyMap(),
    timeLimitSec: 60,
    // 兵士は南向き（侵入者は北側 z=10 を通る = 視界外で音だけが手掛かり）
    soldiers: [standingGuard(0, 0, SOUTH)],
    cameras: [],
    intruders: [
      {
        kind: 'spy',
        x: -12,
        z: 10,
        moveMode,
        path: [{ x: 12, z: 10 }],
      },
    ],
  };
}
