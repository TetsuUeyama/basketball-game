import { S } from "./FieldConfig";

// --- Defense behavior ---

// --- Deflection ---
export const DEFLECT_IMPULSE = 1.2;    // 弾きインパルス強度 (kg·m/s)
export const DEFLECT_COOLDOWN = 0.3;   // 同一障害物の連続弾き防止 (秒)

// --- On-ball movement ---
// Phase H.25: 0.75 → 1.0 (ボール保持中もフルスピード dribble 可能)
//   旧 0.75 だと PG 速度 0.9*0.75=0.675m/s で歩行以下、defender 4.5m/s に追いつかれ放題で
//   on-ball player が判断する前に paint で 3秒バイオレーション頻発した。
export const ON_BALL_SPEED_MULT = 1.0;   // ボール保持時の移動速度倍率
export const ONBALL_BLOCK_RADIUS = 1.2;  // ディフェンダーが進路を塞ぐ距離 (m)

// --- Defense engage threshold ---
// Phase H.10d: 0.5 (ハーフコート直前) — マークがハーフコート越えたら即 engage で密着マーク
export const DEFENSE_ENGAGE_Z = 0.5;  // マーク対象がこのZ以下 (defender 自陣側) で密着 mark 開始

// --- Defense positioning ---
export const DEFENSE_GOAL_OFFSET = 0.8;   // ゴールライン・ポジション: マーク対象からゴール方向へのオフセット (m)
export const FREE_PLAYER_DIST = 5.0;      // フリー判定: 最寄りDFがこの距離以上ならフリーとみなす (m)
// Phase H.8: 1.5 → 0.7 へ緩和 (微小なズレでも sprint で追随、反応性向上)
export const SPRINT_TRIGGER_DIST = 0.7;   // スプリント発動: DF位置からこの距離以上離れていたら全速力 (m)
// Phase H.8: 1.5 → 0.9 へ緩和 (抜かれ判定を早くしてヘルプ発動を早める)
export const BEATEN_GOAL_DIST_MARGIN = 0.9; // 抜かれ判定: オンボールDFがOFよりゴールからこの距離以上遠い → 抜かれた (m)

// --- On-ball defense (goal-line positioning with distance-based aggression) ---
// ゴールからの距離に応じてマーク距離・ホバー半径・速度を線形補間する。
// 遠い(FAR): 程よい距離を保ち簡単に抜かれないようにする。
// 近い(CLOSE): 密着してスティールを狙う。
export const ONBALL_GOAL_DIST_FAR = 8.0;       // この距離以上ではFAR値を使用 (m)
export const ONBALL_GOAL_DIST_CLOSE = 2.5;     // この距離以下ではCLOSE値を使用 (m)
export const ONBALL_MARK_DIST_FAR = 2.0;       // 遠距離時: ゴール方向へのマーク距離 (m)
export const ONBALL_MARK_DIST_CLOSE = 0.7;     // 近距離時: ゴール方向へのマーク距離 (m)
export const ONBALL_HOVER_FAR = 0.30;          // 遠距離時: ホバー半径 (m) — 程よく揺さぶられない
export const ONBALL_HOVER_CLOSE = 0.10;        // 近距離時: ホバー半径 (m) — 密着して奪う
export const ONBALL_RECOVERY_DIST = 1.0;       // 理想位置からこの距離以上ズレたらダッシュで復帰 (m)
export const ONBALL_PASS_CONTEST_DIST = 3.5;   // パス飛行中: レシーバーがこの距離以内なら追跡して争う (m)

// --- Off-ball pass lane denial ---
// Phase H.8: 1.0 → 0.7 へ縮小 (タイトディナイ、パスコース遮断を強化)
export const OFFBALL_DENY_OFFSET = 0.7;        // オフボール: マーク対象からパッサー方向へのディナイ位置オフセット (m)

// --- Hand Push Obstruction ---
export const PUSH_ACTIVATION_DIST = 1.2;   // プッシュ発動距離 — ディナイモード切替 (m)
export const PUSH_SPEED_MULT = 0.55;       // 被プッシュ時の速度倍率
export const PUSH_HAND_REACH = 0.6;        // 手が届く距離（速度減衰が発生する距離）
export const PUSH_DENY_OFFSET = 0.4;       // ターゲットからパッサー方向へのディナイ位置オフセット (m)
export const PUSH_DENY_HOVER = 0.1;        // ディナイ時のホバー半径 (m)（密着に近い）

// --- Obstacle speed ---
export const OBSTACLE_IDLE_SPEED = 80 * S;         // 1.20 m/s
export const OBSTACLE_INTERCEPT_SPEED = 180 * S;   // 2.70 m/s
// Phase H.10b: 全力ダッシュ速度。守備リトリート/トランジション専用
// 通常の intercept (2.70 m/s) より約 65% 速い (NBA トップスピード 6.7 m/s の 67%)
export const OBSTACLE_FULL_SPRINT_SPEED = 4.5;     // 4.50 m/s
