import {
  type SimZone,
  ZONE_PG, ZONE_SG_WING, ZONE_SF_WING, ZONE_C_POST, ZONE_PF_LOW,
} from "../Config/FieldConfig";
import { getOffensiveSpot, type FormationKind } from "../Court/RoleSpots";

// --- Offense role types ---
export type SimPosition = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
export type SimOffenseRole = 'MAIN_HANDLER' | 'SECOND_HANDLER' | 'SCREENER' | 'DUNKER' | 'SLASHER';
export interface SimRoleAssignment {
  position: SimPosition; role: SimOffenseRole;
  zone: SimZone; homeX: number; homeZ: number;
  speedMult: number; reevalInterval: number;
  /** Phase H.17: 攻撃序列 1-5 (1=最高=スター、5=最低=ロールプレイヤー)
   *  低序列 (5 寄り) ほど全力ダッシュ + 厳格ポジション。
   *  高序列 (1 寄り) ほど速度補正 + 許容アバウト。 */
  offenseRank: 1 | 2 | 3 | 4 | 5;
}

/**
 * Phase H.17: 序列から sprint 速度倍率を取得 (rank 1=0.80x、rank 5=1.00x)
 */
export function getSprintSpeedMult(rank: 1 | 2 | 3 | 4 | 5): number {
  const map = { 1: 0.80, 2: 0.85, 3: 0.90, 4: 0.95, 5: 1.00 } as const;
  return map[rank];
}

/**
 * Phase H.17: 序列から positionTolerance (m) を取得 (rank 1=3.0m、rank 5=1.0m)
 */
export function getPositionTolerance(rank: 1 | 2 | 3 | 4 | 5): number {
  const map = { 1: 3.0, 2: 2.5, 3: 2.0, 4: 1.5, 5: 1.0 } as const;
  return map[rank];
}

// --- ベースフォーメーション: 4-Out 1-In (現状のロール構成に最も近い) ---
const BASE_FORMATION: FormationKind = 'four-out-one-in';

/** ロール → ホーム位置を CourtSpots/RoleSpots 経由で取得 (zSign=+1 基準) */
function homeFor(pos: SimPosition): { x: number; z: number } {
  const spot = getOffensiveSpot(pos, BASE_FORMATION, 1);
  return { x: spot.x, z: spot.z };
}

// --- Role assignment table (ホーム位置は CourtSpots から自動導出) ---
const _pgHome = homeFor('PG');
const _sgHome = homeFor('SG');
const _sfHome = homeFor('SF');
const _cHome  = homeFor('C');
const _pfHome = homeFor('PF');

// --- Phase H.17: 攻撃序列マッピング (1=最高、5=最低) ---
// PG はメインハンドラー = スター = 序列 1 (余裕を持って動く)
// PF/C はロールプレイヤー = 序列 5 (ハッスル全力)
export const ROLE_ASSIGNMENTS: {
  launcher: SimRoleAssignment;
  targets: SimRoleAssignment[];
} = {
  launcher: {
    position: 'PG', role: 'MAIN_HANDLER',
    zone: ZONE_PG, homeX: _pgHome.x, homeZ: _pgHome.z,
    speedMult: 1.0, reevalInterval: 1.5,
    offenseRank: 1, // 最高序列 → sprint 0.80x、許容 3.0m (アバウト)
  },
  targets: [
    { position: 'SG', role: 'SECOND_HANDLER', zone: ZONE_SG_WING, homeX: _sgHome.x, homeZ: _sgHome.z, speedMult: 1.0, reevalInterval: 1.5,
      offenseRank: 2 }, // sprint 0.85x、許容 2.5m
    { position: 'SF', role: 'SLASHER',        zone: ZONE_SF_WING, homeX: _sfHome.x, homeZ: _sfHome.z, speedMult: 1.1, reevalInterval: 1.2,
      offenseRank: 3 }, // sprint 0.90x、許容 2.0m
    { position: 'C',  role: 'SCREENER',       zone: ZONE_C_POST,  homeX: _cHome.x,  homeZ: _cHome.z,  speedMult: 0.9, reevalInterval: 2.0,
      offenseRank: 4 }, // sprint 0.95x、許容 1.5m
    { position: 'PF', role: 'DUNKER',         zone: ZONE_PF_LOW,  homeX: _pfHome.x, homeZ: _pfHome.z, speedMult: 0.95, reevalInterval: 1.8,
      offenseRank: 5 }, // 最低序列 → sprint 1.00x、許容 1.0m (厳格)
  ],
};

/**
 * ロールアサインメントをミラーリングする（zSign=-1 でZ座標反転）。
 * homeZ と zone の Z 座標を反転する。X座標はそのまま。
 */
export function getMirroredRole(role: SimRoleAssignment, zSign: 1 | -1): SimRoleAssignment {
  if (zSign === 1) return role;
  return {
    ...role,
    homeZ: -role.homeZ,
    zone: {
      xMin: role.zone.xMin,
      xMax: role.zone.xMax,
      zMin: -role.zone.zMax,
      zMax: -role.zone.zMin,
    },
  };
}

// --- Role-specific constants ---
export const LAUNCHER_EVAL_SAMPLES = 12;
export const SLASHER_VCUT_AMPLITUDE = 1.5;
export const SLASHER_VCUT_PERIOD = 3.0;
export const OPEN_THRESHOLD = 1.2;
export const SCREENER_OFFSET = 1.0;
export const DUNKER_SEAL_DIST = 0.8;
