/**
 * RoleSpots — ロール (PG/SG/SF/PF/C + モダンロール) と CourtSpot の対応
 *
 * 戦術コードは「PG をトップに、PF をショートコーナーに」のように
 * ロール名でポジションを指定できる。
 *
 * フォーメーション (5-Out / 4-Out 1-In / Horns 等) ごとに
 * 異なるロール→スポットマップを提供する。
 */

import {
  type CourtSpot, type CourtSpotName, getSpotByName,
} from "./CourtSpots";
import type { SimPosition } from "../Decision/OffenseRoleAssignment";
import type { ModernRole } from "../Tactics/PositionlessRoles";

/** フォーメーション種別 */
export type FormationKind =
  | 'five-out'        // 5 アウト (全員 3P 外)
  | 'four-out-one-in' // 4 アウト + 1 イン (C ハイポスト)
  | 'horns'           // 1-4 ハイ + 5 ロー + 2/3 コーナー
  | 'flex'            // フレックスオフェンス
  | 'spread';         // スプレッド (全員ワイド)

// =========================================================================
// 従来ポジション (PG/SG/SF/PF/C) → フォーメーション別スポット
// =========================================================================

/** 従来ロールとフォーメーションから推奨スポット名を返す */
export function getOffensiveSpotName(
  position: SimPosition,
  formation: FormationKind,
): CourtSpotName {
  switch (formation) {
    case 'five-out':
      switch (position) {
        case 'PG': return 'top-of-key';
        case 'SG': return 'wing-r';
        case 'SF': return 'wing-l';
        case 'PF': return 'corner-r';
        case 'C':  return 'corner-l';
      }
      break;
    case 'four-out-one-in':
      switch (position) {
        case 'PG': return 'top-of-key';
        case 'SG': return 'wing-r';
        case 'SF': return 'wing-l';
        case 'PF': return 'corner-r';
        case 'C':  return 'high-post';  // ペイント外側
      }
      break;
    case 'horns':
      switch (position) {
        case 'PG': return 'top-of-key';
        case 'SG': return 'corner-r';
        case 'SF': return 'corner-l';
        case 'PF': return 'elbow-r';
        case 'C':  return 'elbow-l';
      }
      break;
    case 'flex':
      switch (position) {
        case 'PG': return 'top-of-key';
        case 'SG': return 'wing-r';
        case 'SF': return 'short-corner-l';
        case 'PF': return 'short-corner-r';
        case 'C':  return 'wing-l';
      }
      break;
    case 'spread':
      switch (position) {
        case 'PG': return 'top-of-key';
        case 'SG': return 'corner-r';
        case 'SF': return 'corner-l';
        case 'PF': return 'wing-r';
        case 'C':  return 'wing-l';
      }
      break;
  }
}

/** ロール + フォーメーション + zSign から世界座標スポットを取得 */
export function getOffensiveSpot(
  position: SimPosition,
  formation: FormationKind,
  zSign: 1 | -1,
): CourtSpot {
  const name = getOffensiveSpotName(position, formation);
  return getSpotByName(name, zSign);
}

// =========================================================================
// 5 スポットの全リスト (Motion Offense / Greedy 割当用)
// =========================================================================

/** フォーメーションの 5 スポット名を順序で返す (PG / SG / SF / PF / C 推奨順) */
export function getFormationSpotNames(formation: FormationKind): CourtSpotName[] {
  return [
    getOffensiveSpotName('PG', formation),
    getOffensiveSpotName('SG', formation),
    getOffensiveSpotName('SF', formation),
    getOffensiveSpotName('PF', formation),
    getOffensiveSpotName('C',  formation),
  ];
}

/** フォーメーションの 5 スポットを世界座標で返す */
export function getFormationSpots(formation: FormationKind, zSign: 1 | -1): CourtSpot[] {
  return getFormationSpotNames(formation).map(name => getSpotByName(name, zSign));
}

// =========================================================================
// モダンロール (Combo Guard / Stretch 4 等) → 推奨スポット
// =========================================================================

export function getModernRoleSpotName(
  role: ModernRole,
  formation: FormationKind,
): CourtSpotName {
  // モダンロールは「能力値に基づく動的役割」だが、ベースフォーメーションでは
  // 似た従来ロールにマップする
  switch (role) {
    case 'COMBO_GUARD':    return getOffensiveSpotName('SG', formation);
    case 'POINT_FORWARD':  return getOffensiveSpotName('SF', formation);
    case 'STRETCH_4':      return formation === 'five-out' ? 'corner-r' : 'wing-r';
    case 'SMALL_BALL_5':   return getOffensiveSpotName('PF', formation);
    case 'TRADITIONAL_PG': return getOffensiveSpotName('PG', formation);
    case 'TRADITIONAL_SG': return getOffensiveSpotName('SG', formation);
    case 'TRADITIONAL_SF': return getOffensiveSpotName('SF', formation);
    case 'TRADITIONAL_PF': return getOffensiveSpotName('PF', formation);
    case 'TRADITIONAL_C':  return getOffensiveSpotName('C',  formation);
  }
}

// =========================================================================
// ディフェンスの基準スポット (マークマンから 1m goal 側)
// =========================================================================

/** ディフェンダーがマーク対象に対して取るべき相対オフセット */
export interface DefenseGuardPosition {
  /** マーク対象との相対 X (正 = 右、ゴール側基準) */
  relX: number;
  /** マーク対象との相対 Z (常にゴール側) */
  relZ: number;
}

export const DEFAULT_GUARD_POSITION: DefenseGuardPosition = {
  relX: 0,
  relZ: -1.0, // ゴール側に 1m
};

/** Pack Line ディフェンスのヘルプ位置 (リムから 16ft = 4.88m) */
export const PACK_LINE_RADIUS = 4.88;
