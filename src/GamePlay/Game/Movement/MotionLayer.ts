/**
 * MotionLayer - 統一されたモーション層 API。
 *
 * Phase H.20: AI / Motion / Tactics のレイヤー分離原則:
 *   - AI 層 (上位): 行動を決定 (dest どこへ向かう / どの action を取るか)
 *   - モーション層 (本ファイル): 実位置を sprint/dash/dribble/walk のいずれかで dt-bounded に更新
 *   - 戦術層 (Scheme/Tactics): チーム/個人戦術で AI に dest を渡す
 *
 * 原則:
 *   - 「位置を変える」操作は必ず本層の関数経由で行う (.x/.z の直接代入禁止)
 *   - 各関数は内部で moveWithFacing を呼び、ワープ (瞬間ジャンプ) を排除
 *   - 戻り値 true = dest 到達
 */
import type { SimMover } from "../Types/TrackingSimTypes";
import { moveWithFacing } from "./MovementCore";
import {
  TARGET_RANDOM_SPEED,
  OFFENSE_FULL_SPRINT_SPEED,
} from "../Config/EntityConfig";

/** dest 到達と判定する距離 (m) */
const ARRIVAL_THRESHOLD = 0.4;
/** 微小ジッタ閾値 — これ以下は dest 到達扱い */
const MICRO_THRESHOLD = 0.075;

function applyMotion(m: SimMover, dest: { x: number; z: number }, speed: number, dt: number, arrivalRadius: number): boolean {
  const dx = dest.x - m.x;
  const dz = dest.z - m.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < arrivalRadius) {
    m.vx = 0;
    m.vz = 0;
    return true;
  }
  m.vx = (dx / d) * speed;
  m.vz = (dz / d) * speed;
  moveWithFacing(m, speed, dt);
  return false;
}

/**
 * 全力ダッシュ移動 (4.5 m/s 基準 × speedMult)。
 * 序列補正・トランジット用。
 */
export function motionSprintTo(
  m: SimMover, dest: { x: number; z: number }, sprintSpeed: number, dt: number,
): boolean {
  return applyMotion(m, dest, sprintSpeed, dt, ARRIVAL_THRESHOLD);
}

/**
 * ダッシュ移動 (sprint より遅い加速移動)。
 * カット / OREB クラッシュ / スキーム指示等の中速移動用。
 * 速度 = TARGET_RANDOM_SPEED × speedMult (デフォルト 1.0)。
 */
export function motionDashTo(
  m: SimMover, dest: { x: number; z: number }, speedMult: number, dt: number,
): boolean {
  const speed = TARGET_RANDOM_SPEED * Math.max(0.1, speedMult);
  return applyMotion(m, dest, speed, dt, MICRO_THRESHOLD);
}

/**
 * ドリブル移動 (on-ball 専用、AI 指定速度で実位置更新)。
 *
 * 注意: ON_BALL_SPEED_MULT (0.75) は呼び出し元の on-ball 共通 post-processing
 *   (launcher/onBallTgt セクション末尾の `x = prevX + dlx * ON_BALL_SPEED_MULT`)
 *   で適用される。本関数では未適用。
 */
export function motionDribbleTo(
  m: SimMover, dest: { x: number; z: number }, speed: number, dt: number,
): boolean {
  return applyMotion(m, dest, speed, dt, MICRO_THRESHOLD);
}

/**
 * 通常移動 (TARGET_RANDOM_SPEED × speedMult)。
 * walk / off-ball idle 用。
 */
export function motionWalkTo(
  m: SimMover, dest: { x: number; z: number }, speedMult: number, dt: number,
): boolean {
  const speed = TARGET_RANDOM_SPEED * Math.max(0.1, speedMult);
  return applyMotion(m, dest, speed, dt, MICRO_THRESHOLD);
}

/**
 * Settle (減速・姿勢落ち着き) モーション。
 * Phase H.23: on-ball 移行直後 (catch / loose ball recovery) で 0.3s 程度呼ばれる。
 * 既存 vx/vz を指数減衰 (係数 0.5/frame ベース) させて moveWithFacing で位置を積分。
 * 戦術 dest 移動は一切行わない (呼び出し側で smart/drive を skip すること)。
 */
export function motionSettle(m: SimMover, dt: number): void {
  // 1 フレーム (~16ms) あたり 0.5x、dt 30ms なら 0.25x のような感じ。
  const decay = Math.pow(0.5, dt / 0.05);
  m.vx *= decay;
  m.vz *= decay;
  moveWithFacing(m, m.speed, dt);
}

/** 各モーションの代表 sprint 速度 (4.5 m/s)。AI 層が直接参照したい場合に。 */
export { OFFENSE_FULL_SPRINT_SPEED };
