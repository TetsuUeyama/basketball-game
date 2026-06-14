import type { SolverConfig } from "@/SimulationPlay/TargetTrackingAccuracySystem";
import { S } from "./FieldConfig";

// --- Speed (m/s) ---
export const LAUNCHER_SPEED = 60 * S;               // 0.90
export const TARGET_RANDOM_SPEED = 80 * S;           // 1.20
export const TARGET_INTERCEPT_SPEED = 180 * S;       // 2.70
export const BALL_SPEED = 250 * S;                   // 3.75
// Phase H.17: オフェンス全力ダッシュ速度 (defender と同じ base = 4.5 m/s)
//   各ロールの offenseRank (1-5) → getSprintSpeedMult で補正される
export const OFFENSE_FULL_SPRINT_SPEED = 4.5;        // 4.50 m/s base
// Phase H.25: on-ball ドリブル時の base 速度 (jog 相当)
//   LAUNCHER_SPEED 0.90 や TARGET_RANDOM_SPEED 1.20 だと walking 以下で
//   NBA 選手が「のんびり歩く」ような状態になっていたため大幅引き上げ。
//   sprint (4.5) より少し遅め、defender intercept (2.70) と同程度。
export const ON_BALL_DRIBBLE_SPEED = 2.7;            // 2.70 m/s

// --- Colors ---
export const TARGET_COLORS_3D = [
  { r: 0.8, g: 0.27, b: 0.27 },  // red
  { r: 0.8, g: 0.47, b: 0.0 },   // orange
  { r: 0.13, g: 0.53, b: 0.67 }, // cyan
  { r: 0.4, g: 0.6, b: 0.0 },    // yellow-green
];

// --- Solver ---
export const SOLVER_CFG_3D: SolverConfig = {
  coarseStep: 0.05,
  fineStep: 0.005,
  minTime: 0.05,
  maxTime: 10.0,
  bisectIterations: 10,
};

// --- Initial positions (metres, basketball court NBA: goal1 at +Z≈12.725) ---
// 3秒ルール回避: C と PF をペイント外に配置 (paint: |x|<2.44, 8.535<z<14.325)
export const INIT_LAUNCHER = { x: 0, z: 5.55 };    // PG - Top of Key
export const INIT_TARGETS = [
  { x: 5.1,  z: 7.65 },  // SG / SECOND_HANDLER - Right Wing
  { x: -5.1, z: 7.65 },  // SF / SLASHER - Left Wing
  { x: 0,    z: 7.5  },  // C  / SCREENER - High Post (ペイント外側、FT ライン手前)
  { x: 3.5,  z: 11.5 },  // PF / DUNKER - Short Corner (ペイント外側 X)
];
export const INIT_OBSTACLES = [
  { x: 0,    z: 4.85 },  // A - guards PG (near Top)
  { x: -4.5, z: 6.85 },  // B - guards SF (near Left Wing)
  { x: 4.5,  z: 6.85 },  // C - guards SG (near Right Wing)
  { x: 4.0,  z: 10.5 },  // D - guards PF (near Short Corner)
  { x: 0.5,  z: 6.5  },  // E - guards C (near High Post)
];
