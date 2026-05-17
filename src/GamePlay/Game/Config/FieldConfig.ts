// --- Scale ---
export const S = 0.015;               // 速度・距離の変換用

// --- Field (basketball court - NBA spec: 94ft × 50ft = 28.65m × 15.24m) ---
export const SIM_FIELD_X_HALF = 7.62;  // コート幅 15.24m / 2
export const SIM_FIELD_Z_HALF = 14.325; // コート長さ 28.65m / 2
export const SIM_MARGIN = 30 * S;      // 0.45 m

// --- Entity size (NBA: 平均 200cm 基準) ---
export const ENTITY_HEIGHT = 2.0;      // m (scale=1.0 の描画身長)
export const BASE_HEIGHT_CM = 200;     // scale=1.0 に対応する身長 (cm)
export const LAUNCHER_SIZE = 0.6;      // m (box width/depth)
export const TARGET_SIZE = 0.5;        // m
export const OBSTACLE_SIZE = 0.44;     // m
export const BALL_DIAMETER = 0.24;     // m (NBA size 7: 直径24cm)

// --- Movement thresholds ---
export const TARGET_STOP_DIST = 0.075;  // 5 * S = 0.075 m — target stops when within this distance

// --- Offense zones (court: 15.24m x 28.65m, goal1: +Z side, rim at z≈12.725) ---
export interface SimZone { xMin: number; xMax: number; zMin: number; zMax: number; }
export const ZONE_PG: SimZone         = { xMin: -3.0, xMax: 3.0,  zMin: 3.85, zMax: 8.85 };
export const ZONE_SG_WING: SimZone    = { xMin: 3.0,  xMax: 7.0,  zMin: 5.85, zMax: 11.85 };
export const ZONE_SF_WING: SimZone    = { xMin: -7.0, xMax: -3.0, zMin: 5.85, zMax: 11.85 };
// ZONE_C_POST: ハイポスト (ペイント外、FT ライン手前)。3秒ルール回避のため zMax を 8.5 (= paint 境界 8.535m) 未満に
export const ZONE_C_POST: SimZone     = { xMin: -2.5, xMax: 2.5,  zMin: 5.5, zMax: 8.4 };
// ZONE_PF_LOW: ショートコーナー (ペイント外側 X)。|x| > 2.44 = paint 境界外
export const ZONE_PF_LOW: SimZone     = { xMin: 2.7,  xMax: 6.0,  zMin: 9.5, zMax: 13.5 };

// --- Spawn area: red paint area (goal2, -Z side) ---
// NBA paint: 16ft × 19ft = 4.88m × 5.79m
export const SPAWN_PAINT_X_HALF = 2.44;        // ペイント半幅 (16ft / 2)
export const SPAWN_PAINT_Z_MIN = -14.125;      // -(Z_HALF - 0.2) ベースライン近く
export const SPAWN_PAINT_Z_MAX = -8.535;       // -(Z_HALF - 5.79) FT ライン位置
export const SPAWN_BASELINE_Z = -13.825;       // -(Z_HALF - 0.5)
