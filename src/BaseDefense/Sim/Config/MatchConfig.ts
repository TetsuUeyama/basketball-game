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

// チェックポイント巡回で経路が長くなったため長め（中断→再挑戦も許容する）
export const DEFAULT_TIME_LIMIT_SEC = 480;

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
      // 南門を見張る首振りカメラ（首振りは門の幅だけ — 南域全体を覆わない）
      {
        x: 3, z: -15,
        facing: angleOf(0 - 3, -18 - -15), // 門の中心 (0,-18) を向く
        sweep: { halfArc: degToRad(25), speed: degToRad(25) },
      },
      // 建物Aのドア前を見張る固定カメラ
      {
        x: -14, z: -1,
        facing: angleOf(0, 4 - -1) , // ドア (z=4) 方向 = 北向き
      },
    ],

    intruders: [
      // スパイ1名: 裏口から侵入 → チェックポイント1(西)→2(南)→4(北中央)を修理 →
      // 開いたゴールの門（機密庫の扉）から機密を奪取 → 西通路経由で裏口から離脱
      // （未修理CPの側のウェイポイントは修理完了まで先へ進まない = 中断されても戻って再挑戦）
      {
        kind: 'spy',
        x: -26, z: -19.2,
        moveMode: 'walk',
        // 注意: 警備の定位置と同一座標のウェイポイントは分離処理と到達判定が
        // 競合して詰まるため必ずずらす。障害物直撃の経路も不可（回避A*はPhase 4）
        path: [
          { x: -29, z: -16 },    // 塀の外（西）へ
          { x: -29, z: 17 },     // 外周を北上
          { x: -29, z: 19.3 },   // 北西角を回る
          { x: -24, z: 19.3 },   // 裏口の外
          { x: -24, z: 16.5 },   // 北西裏口から侵入
          { x: -26, z: 12 },
          { x: -26, z: -4 },
          { x: -26, z: -10 },    // クレートの西側を回り込む
          { x: -23.4, z: -10.4 },// CP1（クレートの南陰）
          { x: -17, z: -13 },    // クレート帯の南陰を東進
          { x: -11, z: -13.5 },  // c4とc1の間の隙間を抜ける
          { x: -11.2, z: -15 },  // CP2（南・門カメラの圏外）
          // 中央のS3レーン(x=0)横断は構造的に不可能 — 西へ戻り北回廊経由でCP4へ
          { x: -11, z: -13.5 },  // まず隙間を北へ戻る（直進はクレートc4東端に衝突）
          { x: -17, z: -13 },
          { x: -26, z: -10 },
          { x: -26, z: 12 },
          { x: -24.5, z: 15.5 },
          { x: -10, z: 16.3 },   // 建物A北側の回廊を東進
          { x: -2, z: 15 },
          { x: 6, z: 15.3 },     // 縦クレートc5の北を回り込む
          { x: 6.4, z: 12.8 },   // CP4（c5の陰・S1レーンから遮蔽）
          { x: 6, z: 15.3 },
          { x: -2, z: 15 },
          { x: -3, z: 12 },
          { x: -7, z: 10.5 },    // 遮蔽壁w1と建物Aの間のスロットへ
          { x: -7, z: 3.5 },     // スロットを南下（S1のレーンから遮蔽される）
          { x: -11, z: 1.2 },
          { x: -14, z: 1.5 },    // ゴールの門の前（3修理で開放済みのはず）
          { x: -14, z: 5 },
          { x: -14, z: 9 },      // 機密（objective）
          { x: -14, z: 1.5 },
          { x: -20, z: -1 },
          { x: -26, z: -2 },     // 西通路経由で離脱
          { x: -26, z: 12 },
          { x: -24, z: 16.5 },
          { x: -24, z: 19.3 },
          { x: -29, z: 19.3 },
          { x: -29, z: 17 },
          { x: -29, z: -16 },
          { x: -26, z: -19.2 },  // 離脱ゾーン（南西角）
        ],
      },
    ],
  };
}
