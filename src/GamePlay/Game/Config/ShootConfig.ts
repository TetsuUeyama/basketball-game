// --- Shoot (NBA spec) ---
// ペイントエリア参照（GoalConfig.PAINT_HALF_WIDTH/PAINT_DEPTH と同期）
export const SHOOT_ZONE_X_HALF = 2.44;     // ペイント半幅 (NBA: 16ft / 2)
// SIM_FIELD_Z_HALF (14.325) - PAINT_DEPTH (5.79) = 8.535（FT ライン位置）
export const SHOOT_ZONE_Z_MIN = 8.535;     // ペイントZ下限（FTライン）
export const SHOOT_ZONE_Z_MAX = 14.325;    // ペイントZ上限（ベースライン）
export const MAX_SHOOT_RANGE = 9.0;        // ゴールからの最大シュート距離 (m)（3Pライン+約1.8m）
export const MIN_SHOOT_Z = 2.0;            // シュート可能な最小Z座標（バックコート防止）— 動的ミラーリングで使用
export const MAX_SHOOT_CHARGE = 0.8;       // 最大チャージ時間 (秒)（最長距離シュート時）
export const SHOOT_CHARGE_DEAD_ZONE = 1.0; // チャージ不要距離 (m)（ゴール下はチャージなし）
export const SHOT_ARC_HEIGHT = 2.5;        // シュートの放物線高さ (m)

// --- Legacy aliases (GOAL_RIM_X/Y/Z/RADIUS) → GoalConfig.ts が正式定義 ---
// 既存コードの import 互換のため re-export
export { GOAL1_RIM_X as GOAL_RIM_X, GOAL1_RIM_Z as GOAL_RIM_Z, GOAL_RIM_Y, GOAL_RIM_RADIUS } from "./GoalConfig";
