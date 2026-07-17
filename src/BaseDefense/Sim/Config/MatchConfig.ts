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
      // S1: 建物A（機密庫）の東側を往復し、周回ごとにドア前の見回りに立ち寄る。
      // 西通路・裏口は巡回対象外（守りの薄い侵入路を残すレベルデザイン）だが、
      // ドア前チェックがあるためカメラを無効化しても「人の目」は定期的に入る
      {
        x: -4, z: 0,
        route: {
          mode: 'pingpong',
          points: [
            { x: -12, z: 0.5, waitSec: 2.0, lookAngle: NORTH }, // 金庫ドア前チェック
            { x: -4, z: 0, waitSec: 1.5, lookAngle: SOUTH },
            { x: -4, z: 16, waitSec: 2.0, lookAngle: WEST },
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
      // スパイ1名: 南西角から塀の外周を北へ回り込み → 北西裏口から侵入 →
      // 西通路を南下して機密庫 → 奪取 → 同経路を逆走して離脱
      // （正面の南門はカメラ+門番で固い。裏口は巡回S1が周期的に通るだけ —
      //   隠密AIがS1のコーンを待ち避けながら進む）
      {
        kind: 'spy',
        x: -26, z: -19.2,
        moveMode: 'walk',
        // 注意: 警備の定位置と同一座標のウェイポイントは分離処理と到達判定が
        // 競合して詰まるため必ずずらす。障害物直撃の経路も不可（回避A*はPhase 4）
        path: [
          { x: -29, z: -16 },   // 塀の外（西）へ
          { x: -29, z: 17 },    // 外周を北上
          { x: -29, z: 19.3 },  // 北西角を回る
          { x: -24, z: 19.3 },  // 裏口の外
          { x: -24, z: 16.5 },  // 北西裏口から侵入
          { x: -26, z: 12 },
          { x: -26, z: -2 },    // 西通路を南下（S1巡回域）
          { x: -14, z: 1 },     // 建物Aドア前（固定カメラの監視域）
          { x: -14, z: 9 },     // 機密（objective）
          { x: -14, z: 1 },
          { x: -26, z: -2 },    // 往路を逆に戻る
          { x: -26, z: 12 },
          { x: -24, z: 16.5 },
          { x: -24, z: 19.3 },
          { x: -29, z: 19.3 },
          { x: -29, z: 17 },
          { x: -29, z: -16 },
          { x: -26, z: -19.2 }, // 離脱ゾーン（南西角）
        ],
      },
    ],
  };
}
