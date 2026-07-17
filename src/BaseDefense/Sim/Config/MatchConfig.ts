/**
 * MatchConfig — デフォルトの試合セットアップ。
 *
 * Phase 5 の配置フェーズUIが完成するまでは、ここで定義した
 * 兵士配置・巡回ルート・カメラ・侵入者計画がそのまま使われる。
 * 方角の指定は angleOf(dx,dz) で意味的に書く（生の角度定数を書かない）。
 */

import { angleOf, degToRad } from '../Core/MathUtils';
import type { SimSetup } from '../Core/SimState';
import { createBaseMap } from './MapDef';

/** 方角ヘルパー（+Z基準）。lookAngle 指定を可読にする */
const NORTH = angleOf(0, 1);   // +Z
const SOUTH = angleOf(0, -1);  // -Z
const EAST = angleOf(1, 0);    // +X
const WEST = angleOf(-1, 0);   // -X

export const DEFAULT_TIME_LIMIT_SEC = 240;

export function createDefaultSetup(seed: number = 20260717): SimSetup {
  const map = createBaseMap();

  return {
    seed,
    map,
    timeLimitSec: DEFAULT_TIME_LIMIT_SEC,

    soldiers: [
      // S1: 建物A（機密庫）外周を時計回りに巡回
      {
        x: -24, z: 0,
        route: {
          mode: 'cycle',
          points: [
            { x: -24, z: 0, waitSec: 1.5, lookAngle: SOUTH },
            { x: -24, z: 16, waitSec: 1.5, lookAngle: WEST },
            { x: -4, z: 16, waitSec: 1.5, lookAngle: EAST },
            { x: -4, z: 0, waitSec: 1.5, lookAngle: SOUTH },
          ],
        },
      },
      // S2: 東側・兵舎周りを巡回
      {
        x: 6, z: -16,
        route: {
          mode: 'cycle',
          points: [
            { x: 6, z: -16, waitSec: 1.0, lookAngle: SOUTH },
            { x: 24, z: -16, waitSec: 1.5, lookAngle: EAST },
            { x: 24, z: -2, waitSec: 1.5, lookAngle: NORTH },
            { x: 6, z: -2, waitSec: 1.0, lookAngle: WEST },
          ],
        },
      },
      // S3: 南門〜中央通路を往復（門番）
      {
        x: 0, z: -16,
        route: {
          mode: 'pingpong',
          points: [
            { x: 0, z: -16, waitSec: 2.5, lookAngle: SOUTH },
            { x: 0, z: 2, waitSec: 1.5, lookAngle: NORTH },
          ],
        },
      },
    ],

    cameras: [
      // 南門を見張る首振りカメラ
      {
        x: 3, z: -15,
        facing: angleOf(0 - 3, -18 - -15), // 門の中心 (0,-18) を向く
        sweep: { halfArc: degToRad(35), speed: degToRad(25) },
      },
      // 建物Aのドア前を見張る固定カメラ
      {
        x: -14, z: -1,
        facing: angleOf(0, 4 - -1) , // ドア (z=4) 方向 = 北向き
      },
    ],

    intruders: [
      // スパイ1名: 南門→西回りで機密庫→機密奪取→南門から離脱
      {
        kind: 'spy',
        x: 0, z: -19.2,
        moveMode: 'walk',
        // 注意: 門番(S3)の立ち位置 (0,-16) と同一座標をウェイポイントにすると
        // 分離処理と到達判定が競合して詰まる — 経路は警備の定位置から必ずずらす
        path: [
          { x: -1.6, z: -15 },
          { x: -6, z: -12 },
          { x: -22, z: -12 },
          { x: -26, z: -10 },  // クレート (-24,-8)-(-20,-8) の西側を回る（回避AIはPhase 4）
          { x: -24, z: -2 },
          { x: -24, z: 2 },
          { x: -14, z: 1 },   // 建物Aドア前
          { x: -14, z: 9 },   // 機密（objective）
          { x: -14, z: 1 },
          { x: -10, z: -8 },
          { x: -4, z: -14 },
          { x: -1.6, z: -15.5 },
          { x: 0, z: -19.2 }, // 離脱ゾーン
        ],
      },
    ],
  };
}
