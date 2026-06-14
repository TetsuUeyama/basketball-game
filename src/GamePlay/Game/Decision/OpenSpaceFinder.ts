import {
  SIM_FIELD_X_HALF,
  SIM_FIELD_Z_HALF,
  SIM_MARGIN,
} from "../Config/FieldConfig";
import { TARGET_RANDOM_SPEED } from "../Config/EntityConfig";
import type { SimZone } from "../Config/FieldConfig";
import type { SimMover } from "../Types/TrackingSimTypes";
import { dist2d, normAngleDiff, moveWithFacing } from "../Movement/MovementCore";
import { isPhysicallyClose, fovHalfAtDist } from "./TrajectoryAnalysis";
import { scoreFieldPosition } from "./FieldPositionScorer";
import { scoreSpacing } from "./Spacing";
import { getGoalX, getGoalZ } from "../Action/ShootAction";
import { isInPaint } from "../Config/GoalConfig";

/** Phase H.24: 3秒違反回避は「常時」適用。off-ball の dest を最初から paint に置かない。
 *  - 基本ペナルティ: paintTime=0 でも paint 内 dest は減点 (proactive avoidance)
 *  - escalate 閾値: これ以上ならさらに強いペナルティ (緊急退出)
 */
const PAINT_AVOIDANCE_BASE_PENALTY = 20.0;
/** paint 滞在 escalate 閾値 (秒) */
const PAINT_AVOIDANCE_ESCALATE_THRESHOLD = 0.5;
/** escalate 後の追加ペナルティ (1秒あたり) */
const PAINT_AVOIDANCE_ESCALATE_PENALTY = 30.0;

/** Find open space on field */
export function findOpenSpace(
  launcher: SimMover, obstacles: SimMover[],
): { x: number; z: number } {
  const xMin = -SIM_FIELD_X_HALF + SIM_MARGIN;
  const xMax = SIM_FIELD_X_HALF - SIM_MARGIN;
  const zMin = -SIM_FIELD_Z_HALF + SIM_MARGIN;
  const zMax = SIM_FIELD_Z_HALF - SIM_MARGIN;

  let bestX = 0;
  let bestZ = 0;
  let bestScore = -Infinity;

  for (let i = 0; i < 30; i++) {
    const px = xMin + Math.random() * (xMax - xMin);
    const pz = zMin + Math.random() * (zMax - zMin);
    let score = 0;

    let minObDist = Infinity;
    for (const ob of obstacles) {
      const d = dist2d(px, pz, ob.x, ob.z);
      minObDist = Math.min(minObDist, d);
      score += Math.min(d, 250 * 0.015); // 3.75m cap
    }
    score += minObDist * 2;

    for (const ob of obstacles) {
      const d = dist2d(px, pz, ob.x, ob.z);
      const fovHalf = fovHalfAtDist(d);
      const angle = Math.atan2(pz - ob.z, px - ob.x);
      if (Math.abs(normAngleDiff(ob.neckFacing, angle)) > fovHalf) {
        score += 100 * 0.015; // scaled
      }
    }

    let pathClear = true;
    for (const ob of obstacles) {
      if (isPhysicallyClose(ob, launcher.x, launcher.z, px, pz)) {
        pathClear = false;
        break;
      }
    }
    if (pathClear) score += 150 * 0.015;

    const ld = dist2d(px, pz, launcher.x, launcher.z);
    if (ld > 150 * 0.015) score += 50 * 0.015;

    if (score > bestScore) {
      bestScore = score;
      bestX = px;
      bestZ = pz;
    }
  }
  return { x: bestX, z: bestZ };
}

/** Zone-constrained open space finder.
 *  @param paintTimeAccumulated Phase H.12: この選手が現在の paint 滞在で蓄積している秒数。
 *    1.5s 以上なら paint 内位置を強くペナルティし、3秒違反を回避する。
 */
export function findOpenSpaceInZone(
  zone: SimZone,
  launcher: SimMover,
  obstacles: SimMover[],
  otherTargets: SimMover[],
  homeX: number,
  homeZ: number,
  samples = 20,
  paintTimeAccumulated = 0,
): { x: number; z: number } {
  let bestX = homeX;
  let bestZ = homeZ;
  let bestScore = -Infinity;

  for (let i = 0; i < samples; i++) {
    const px = zone.xMin + Math.random() * (zone.xMax - zone.xMin);
    const pz = zone.zMin + Math.random() * (zone.zMax - zone.zMin);
    let score = 0;

    // Distance from obstacles
    let minObDist = Infinity;
    for (const ob of obstacles) {
      const d = dist2d(px, pz, ob.x, ob.z);
      minObDist = Math.min(minObDist, d);
      score += Math.min(d, 3.75);
    }
    score += minObDist * 2;

    // Pass lane clearance
    let pathClear = true;
    for (const ob of obstacles) {
      if (isPhysicallyClose(ob, launcher.x, launcher.z, px, pz)) {
        pathClear = false;
        break;
      }
    }
    if (pathClear) score += 2.25;

    // FOV avoidance
    for (const ob of obstacles) {
      const d = dist2d(px, pz, ob.x, ob.z);
      const fovHalf = fovHalfAtDist(d);
      const angle = Math.atan2(pz - ob.z, px - ob.x);
      if (Math.abs(normAngleDiff(ob.neckFacing, angle)) > fovHalf) {
        score += 1.5;
      }
    }

    // Field position value (goal proximity + center bonus + isolation)
    const allPlayers = [...obstacles, launcher, ...otherTargets];
    const fp = scoreFieldPosition(px, pz, allPlayers);
    score += fp.total * 5.0;

    // Proximity to home position (gentle pull — allow freedom within zone)
    const homeDist = dist2d(px, pz, homeX, homeZ);
    score -= homeDist * 0.3;

    // Phase H.11: 包括的スペーシング評価 (理想 4.57-5.49m + フロアバランス + ドライブレーン)
    //   旧実装は SPREAD_MIN=3.5m の単純混雑ペナルティのみ。
    //   新実装は IDEAL_SPACING_MIN/MAX に基づく理想距離ボーナス + コート 3 等分のフロアバランス
    //   + ボールハンドラーのドライブレーン確保
    const teammates = [launcher, ...otherTargets];
    const allOffense = [launcher, ...otherTargets]; // 自分以外 (note: 評価点 (px, pz) は別位置として扱い)
    const spacingScore = scoreSpacing(
      px, pz,
      teammates,        // 接近ペナルティ + 理想距離ボーナス
      allOffense,       // フロアバランス用
      launcher,         // ボール保持者 (drive lane の起点)
      getGoalX(), getGoalZ(),
    );
    score += spacingScore.total * 3.0; // weight

    // Phase H.24: 3秒違反回避 — paint 内 dest は常時ペナルティ + 滞在時間で escalate
    //   off-ball プレイヤーは on-ball 以外 3秒違反対象なので、最初から paint dest を避ける。
    //   on-ball プレイヤーは moveOnBallSmart 経由 (本関数を通らない) なので影響なし。
    {
      const goalZ = getGoalZ();
      const goalSide: 1 | -1 = goalZ > 0 ? 1 : -1;
      if (isInPaint(px, pz, goalSide)) {
        score -= PAINT_AVOIDANCE_BASE_PENALTY;
        if (paintTimeAccumulated > PAINT_AVOIDANCE_ESCALATE_THRESHOLD) {
          const overTime = paintTimeAccumulated - PAINT_AVOIDANCE_ESCALATE_THRESHOLD;
          score -= PAINT_AVOIDANCE_ESCALATE_PENALTY * (1 + overTime);
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestX = px;
      bestZ = pz;
    }
  }
  return { x: bestX, z: bestZ };
}

/** Move target toward open space */
export function moveTargetToOpenSpace(
  tgt: SimMover,
  dest: { x: number; z: number } | null,
  reevalTimer: number,
  dt: number,
  launcher: SimMover,
  allObs: SimMover[],
): { dest: { x: number; z: number }; reevalTimer: number } {
  reevalTimer -= dt;
  const atDest = dest && dist2d(tgt.x, tgt.z, dest.x, dest.z) < 20 * 0.015;
  if (reevalTimer <= 0 || !dest || atDest) {
    dest = findOpenSpace(launcher, allObs);
    reevalTimer = 1.5 + Math.random();
  }
  const dx = dest.x - tgt.x;
  const dz = dest.z - tgt.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > 5 * 0.015) {
    tgt.vx = (dx / d) * TARGET_RANDOM_SPEED;
    tgt.vz = (dz / d) * TARGET_RANDOM_SPEED;
  } else {
    tgt.vx = 0;
    tgt.vz = 0;
  }
  moveWithFacing(tgt, TARGET_RANDOM_SPEED, dt);
  return { dest, reevalTimer };
}
