/**
 * CourtSpots — NBA コートの名前付きポジション (世界座標)
 *
 * 攻撃方向 (zSign = +1 or -1) を引数に取り、世界座標を返す。
 * これにより戦術コード (Scheme/Skill/RoleMovement) は座標リテラルを書かずに
 * 「コーナー」「リム」「トップ」等の意味でポジションを指定できる。
 *
 * 基準: NBA spec (Phase G.0 で校正)
 *  - コート長: 28.65m (Z 軸)
 *  - コート幅: 15.24m (X 軸)
 *  - リム: ベースラインから 1.575m (z = ±12.725)
 *  - 3P アーク: リムから 7.24m
 *  - 3P コーナー直線: |x| = 6.71m
 *  - FT ライン: ベースラインから 5.79m
 *  - ペイント: |x| ≤ 2.44m, 5.79m × 4.88m
 */

import { SIM_FIELD_Z_HALF } from "../Config/FieldConfig";
import {
  GOAL1_RIM_X,
  GOAL1_RIM_Z,
  PAINT_HALF_WIDTH,
  PAINT_DEPTH,
  FREE_THROW_LINE_DIST,
  THREE_POINT_RADIUS,
  THREE_POINT_CORNER_HALF_X,
} from "../Config/GoalConfig";

/** zSign 反転を考慮した「ゴールから N メートル離れた Z 座標」 */
function fromBaselineZ(distFromBaseline: number, zSign: 1 | -1): number {
  // ベースラインは zSign * SIM_FIELD_Z_HALF
  return zSign * (SIM_FIELD_Z_HALF - distFromBaseline);
}

/** zSign 反転を考慮した「リムから N メートル手前 (オフェンス側)」 */
function fromRimZ(distFromRim: number, zSign: 1 | -1): number {
  return zSign * (GOAL1_RIM_Z - distFromRim);
}

export interface CourtSpot {
  x: number;
  z: number;
  label: string;
}

// =========================================================================
// リム周辺
// =========================================================================

export function getRim(zSign: 1 | -1): CourtSpot {
  return { x: GOAL1_RIM_X, z: zSign * GOAL1_RIM_Z, label: 'Rim' };
}

/** リム真下、ボード正面 (リバウンドポジショニング基準点) */
export function getRimUnder(zSign: 1 | -1): CourtSpot {
  return { x: 0, z: fromBaselineZ(0.5, zSign), label: 'Rim Under' };
}

// =========================================================================
// ペイント / ローポスト
// =========================================================================

/** ローポスト左ブロック (リム横、ペイント内) */
export function getLowPostLeft(zSign: 1 | -1): CourtSpot {
  return { x: -PAINT_HALF_WIDTH * 0.85, z: fromBaselineZ(1.5, zSign), label: 'Low Post L' };
}

/** ローポスト右ブロック */
export function getLowPostRight(zSign: 1 | -1): CourtSpot {
  return { x: PAINT_HALF_WIDTH * 0.85, z: fromBaselineZ(1.5, zSign), label: 'Low Post R' };
}

/** ミッドポスト左 (ローブロックから少し上、FT ラインの手前) */
export function getMidPostLeft(zSign: 1 | -1): CourtSpot {
  return { x: -PAINT_HALF_WIDTH * 0.9, z: fromBaselineZ(3.5, zSign), label: 'Mid Post L' };
}

export function getMidPostRight(zSign: 1 | -1): CourtSpot {
  return { x: PAINT_HALF_WIDTH * 0.9, z: fromBaselineZ(3.5, zSign), label: 'Mid Post R' };
}

/** ハイポスト (FT ライン中央、ペイント外側ギリギリ) */
export function getHighPost(zSign: 1 | -1): CourtSpot {
  // FT ライン (5.79m from baseline) のちょい手前 (ペイント外)
  return { x: 0, z: fromBaselineZ(FREE_THROW_LINE_DIST + 0.1, zSign), label: 'High Post' };
}

/** エルボー左 (FT ラインの左端、ペイント角) */
export function getElbowLeft(zSign: 1 | -1): CourtSpot {
  return { x: -PAINT_HALF_WIDTH, z: fromBaselineZ(FREE_THROW_LINE_DIST, zSign), label: 'Elbow L' };
}

/** エルボー右 */
export function getElbowRight(zSign: 1 | -1): CourtSpot {
  return { x: PAINT_HALF_WIDTH, z: fromBaselineZ(FREE_THROW_LINE_DIST, zSign), label: 'Elbow R' };
}

// =========================================================================
// 3P ライン外周
// =========================================================================

/** トップ・オブ・ザ・キー (3P ライン上、中央) */
export function getTopOfKey(zSign: 1 | -1): CourtSpot {
  return { x: 0, z: fromRimZ(THREE_POINT_RADIUS + 0.5, zSign), label: 'Top of Key' };
}

/** スロット左 (トップとウィングの間) */
export function getSlotLeft(zSign: 1 | -1): CourtSpot {
  return { x: -3.5, z: fromRimZ(THREE_POINT_RADIUS * 0.85, zSign), label: 'Slot L' };
}

/** スロット右 */
export function getSlotRight(zSign: 1 | -1): CourtSpot {
  return { x: 3.5, z: fromRimZ(THREE_POINT_RADIUS * 0.85, zSign), label: 'Slot R' };
}

/** ウィング左 (3P ライン上の側面) */
export function getWingLeft(zSign: 1 | -1): CourtSpot {
  return { x: -5.5, z: fromRimZ(THREE_POINT_RADIUS * 0.6, zSign), label: 'Wing L' };
}

/** ウィング右 */
export function getWingRight(zSign: 1 | -1): CourtSpot {
  return { x: 5.5, z: fromRimZ(THREE_POINT_RADIUS * 0.6, zSign), label: 'Wing R' };
}

/** コーナー左 (3P ラインのコーナー、ベースライン近く) */
export function getCornerLeft(zSign: 1 | -1): CourtSpot {
  return { x: -(THREE_POINT_CORNER_HALF_X - 0.1), z: fromBaselineZ(1.0, zSign), label: 'Corner L' };
}

/** コーナー右 */
export function getCornerRight(zSign: 1 | -1): CourtSpot {
  return { x: THREE_POINT_CORNER_HALF_X - 0.1, z: fromBaselineZ(1.0, zSign), label: 'Corner R' };
}

/** ショートコーナー左 (コーナーとローブロックの間、ペイント外側 X) */
export function getShortCornerLeft(zSign: 1 | -1): CourtSpot {
  return { x: -(PAINT_HALF_WIDTH + 0.6), z: fromBaselineZ(2.5, zSign), label: 'Short Corner L' };
}

/** ショートコーナー右 */
export function getShortCornerRight(zSign: 1 | -1): CourtSpot {
  return { x: PAINT_HALF_WIDTH + 0.6, z: fromBaselineZ(2.5, zSign), label: 'Short Corner R' };
}

// =========================================================================
// ミッドレンジ (2P 圏内、ペリメーター内側)
// =========================================================================

/** フリースローライン延長線上、ウィング側 (Wing L よりリム寄り) */
export function getMidWingLeft(zSign: 1 | -1): CourtSpot {
  return { x: -4.2, z: fromRimZ(4.5, zSign), label: 'Mid Wing L' };
}

export function getMidWingRight(zSign: 1 | -1): CourtSpot {
  return { x: 4.2, z: fromRimZ(4.5, zSign), label: 'Mid Wing R' };
}

// =========================================================================
// ハーフコート / バックコート (トランジション基準)
// =========================================================================

/** ハーフコート中央 (z=0) */
export function getHalfcourt(): CourtSpot {
  return { x: 0, z: 0, label: 'Halfcourt' };
}

/** バックコート、自陣 FT ライン延長 (トランジション開始地点) */
export function getBackcourtTop(zSign: 1 | -1): CourtSpot {
  // 自陣 = 攻撃ゴール反対側 = -zSign 方向
  return { x: 0, z: -zSign * (SIM_FIELD_Z_HALF - 7.0), label: 'Backcourt Top' };
}

/** 自陣ベースライン中央 (試合開始時のスタート位置) */
export function getOwnBaseline(zSign: 1 | -1): CourtSpot {
  return { x: 0, z: -zSign * (SIM_FIELD_Z_HALF - 0.5), label: 'Own Baseline' };
}

// =========================================================================
// 集約: 名前文字列から取得
// =========================================================================

export type CourtSpotName =
  | 'rim' | 'rim-under'
  | 'low-post-l' | 'low-post-r' | 'mid-post-l' | 'mid-post-r'
  | 'high-post' | 'elbow-l' | 'elbow-r'
  | 'top-of-key' | 'slot-l' | 'slot-r'
  | 'wing-l' | 'wing-r' | 'mid-wing-l' | 'mid-wing-r'
  | 'corner-l' | 'corner-r' | 'short-corner-l' | 'short-corner-r'
  | 'halfcourt' | 'backcourt-top' | 'own-baseline';

export function getSpotByName(name: CourtSpotName, zSign: 1 | -1): CourtSpot {
  switch (name) {
    case 'rim': return getRim(zSign);
    case 'rim-under': return getRimUnder(zSign);
    case 'low-post-l': return getLowPostLeft(zSign);
    case 'low-post-r': return getLowPostRight(zSign);
    case 'mid-post-l': return getMidPostLeft(zSign);
    case 'mid-post-r': return getMidPostRight(zSign);
    case 'high-post': return getHighPost(zSign);
    case 'elbow-l': return getElbowLeft(zSign);
    case 'elbow-r': return getElbowRight(zSign);
    case 'top-of-key': return getTopOfKey(zSign);
    case 'slot-l': return getSlotLeft(zSign);
    case 'slot-r': return getSlotRight(zSign);
    case 'wing-l': return getWingLeft(zSign);
    case 'wing-r': return getWingRight(zSign);
    case 'mid-wing-l': return getMidWingLeft(zSign);
    case 'mid-wing-r': return getMidWingRight(zSign);
    case 'corner-l': return getCornerLeft(zSign);
    case 'corner-r': return getCornerRight(zSign);
    case 'short-corner-l': return getShortCornerLeft(zSign);
    case 'short-corner-r': return getShortCornerRight(zSign);
    case 'halfcourt': return getHalfcourt();
    case 'backcourt-top': return getBackcourtTop(zSign);
    case 'own-baseline': return getOwnBaseline(zSign);
  }
}
