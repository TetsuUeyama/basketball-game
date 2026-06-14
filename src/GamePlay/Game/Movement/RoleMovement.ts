import {
  ROLE_ASSIGNMENTS,
  getMirroredRole,
  LAUNCHER_EVAL_SAMPLES,
  SLASHER_VCUT_AMPLITUDE,
  SLASHER_VCUT_PERIOD,
  OPEN_THRESHOLD,
  SCREENER_OFFSET,
  DUNKER_SEAL_DIST,
  getSprintSpeedMult,
  getPositionTolerance,
  type SimRoleAssignment,
} from "../Decision/OffenseRoleAssignment";
import type { SimZone } from "../Config/FieldConfig";
import { TARGET_RANDOM_SPEED, TARGET_INTERCEPT_SPEED, OFFENSE_FULL_SPRINT_SPEED, ON_BALL_DRIBBLE_SPEED } from "../Config/EntityConfig";
import type { SimMover, LauncherState, SlasherState, ScreenerState, DunkerState } from "../Types/TrackingSimTypes";
import { dist2d, moveWithFacing } from "../Movement/MovementCore";
import { MAX_SHOOT_RANGE } from "../Config/ShootConfig";
import { getGoalX, getGoalZ } from "../Action/ShootAction";
import { isPhysicallyClose, isTrajectoryInFOV } from "../Decision/TrajectoryAnalysis";
import { findOpenSpaceInZone } from "../Decision/OpenSpaceFinder";
import { isInPaint } from "../Config/GoalConfig";

/** Phase H.24: 攻撃ゴール側の paint 内かどうかを判定 (3秒違反回避の dest チェック用)。 */
function isDestInOffenseGoalPaint(dest: { x: number; z: number } | null): boolean {
  if (!dest) return false;
  const goalSide: 1 | -1 = getGoalZ() > 0 ? 1 : -1;
  return isInPaint(dest.x, dest.z, goalSide);
}

/**
 * Transit mode: move toward home position at full sprint with role hierarchy.
 *
 * Phase H.17: 序列 (offenseRank 1-5) に基づく全力ダッシュ
 *  - rank 1 (PG): sprint 0.80x、許容 3.0m (アバウト)
 *  - rank 2 (SG): sprint 0.85x、許容 2.5m
 *  - rank 3 (SF): sprint 0.90x、許容 2.0m
 *  - rank 4 (C):  sprint 0.95x、許容 1.5m
 *  - rank 5 (PF): sprint 1.00x、許容 1.0m (厳格)
 *
 * Returns true when player has entered position tolerance radius (transit complete).
 */
export function moveTransitToHome(m: SimMover, entityIdx: number, dt: number, zSign: 1 | -1 = 1): boolean {
  const baseRole = entityIdx === 0
    ? ROLE_ASSIGNMENTS.launcher
    : ROLE_ASSIGNMENTS.targets[entityIdx - 1];
  const role = getMirroredRole(baseRole, zSign);
  const speedMult = getSprintSpeedMult(baseRole.offenseRank);
  const tolerance = getPositionTolerance(baseRole.offenseRank);
  const sprintSpeed = OFFENSE_FULL_SPRINT_SPEED * speedMult;
  moveTowardDest(m, { x: role.homeX, z: role.homeZ }, sprintSpeed, dt);
  const distToHome = dist2d(m.x, m.z, role.homeX, role.homeZ);
  return distToHome <= tolerance;
}

// Phase H.20: moveSprintTo は MotionLayer.motionSprintTo に統合 (重複削除)。
//   新規呼び出しは `motionSprintTo` (Movement/MotionLayer) を使用すること。

/** Clamp position to zone bounds */
function clampToZone(m: SimMover, zone: SimZone): void {
  const pad = 0.05;
  const prevX = m.x;
  const prevZ = m.z;
  m.x = Math.max(zone.xMin + pad, Math.min(zone.xMax - pad, m.x));
  m.z = Math.max(zone.zMin + pad, Math.min(zone.zMax - pad, m.z));
  // Phase H.22: warp detection
  const dx = m.x - prevX;
  const dz = m.z - prevZ;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > 0.5) {
    console.warn(
      `[CLAMP-TO-ZONE WARP] (${prevX.toFixed(2)},${prevZ.toFixed(2)}) → (${m.x.toFixed(2)},${m.z.toFixed(2)}) d=${d.toFixed(2)}m | ` +
      `zone xMin=${zone.xMin} xMax=${zone.xMax} zMin=${zone.zMin} zMax=${zone.zMax}`,
    );
  }
}

/** Move toward a destination point */
function moveTowardDest(m: SimMover, dest: { x: number; z: number }, speed: number, dt: number): void {
  const dx = dest.x - m.x;
  const dz = dest.z - m.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > 0.075) {
    m.vx = (dx / d) * speed;
    m.vz = (dz / d) * speed;
  } else {
    m.vx = 0;
    m.vz = 0;
  }
  moveWithFacing(m, speed, dt);
}

// =========================================================================
// Drive lane detection & drive movement
// =========================================================================

/** ドライブレーン幅の半分 (m) */
const DRIVE_LANE_HALF_WIDTH = 1.0;
/** ドライブ可能な最小ゴール距離 (m) — レイアップ圏内では false */
const DRIVE_MIN_DIST = 2.0;

/**
 * ゴールへのドライブレーンが空いているか判定する。
 * - ゴールまでの距離が DRIVE_MIN_DIST〜MAX_SHOOT_RANGE
 * - 幅 2m (±1m) のドライブレーンにDFがいない
 */
export function isDriveLaneClear(mover: SimMover, obstacles: SimMover[]): boolean {
  const dx = getGoalX() - mover.x;
  const dz = getGoalZ() - mover.z;
  const distToGoal = Math.sqrt(dx * dx + dz * dz);

  // レイアップ圏内 or シュートレンジ外 → ドライブ不要
  if (distToGoal < DRIVE_MIN_DIST || distToGoal > MAX_SHOOT_RANGE) return false;

  // ドライブ方向の単位ベクトル
  const nx = dx / distToGoal;
  const nz = dz / distToGoal;

  for (const ob of obstacles) {
    const ox = ob.x - mover.x;
    const oz = ob.z - mover.z;

    // レーン方向への射影距離（前方のみチェック）
    const proj = ox * nx + oz * nz;
    if (proj < 0 || proj > distToGoal) continue;

    // レーンに対する横方向距離
    const perp = Math.abs(ox * (-nz) + oz * nx);
    if (perp < DRIVE_LANE_HALF_WIDTH) return false;
  }
  return true;
}

/**
 * ゴールへのドライブ移動。ゾーンクランプなしでゴール方向に直進する。
 * ON_BALL_SPEED_MULT / blockOnBallByDefenders は呼び出し元で適用済み。
 * Phase H.25: mover.speed (LAUNCHER_SPEED=0.9 / TARGET_RANDOM_SPEED=1.2) ではなく
 *   ON_BALL_DRIBBLE_SPEED (2.7m/s) を使う。jog 相当の速度でドライブ。
 */
export function moveOnBallDrive(mover: SimMover, dt: number): void {
  moveTowardDest(mover, { x: getGoalX(), z: getGoalZ() }, ON_BALL_DRIBBLE_SPEED, dt);
}

/**
 * On-ball smart movement: evaluate zone positions for best pass lane coverage.
 * Used by any on-ball offense player (launcher or target holding the ball).
 */
export function moveOnBallSmart(
  mover: SimMover,
  state: LauncherState,
  receivers: SimMover[],
  obstacles: SimMover[],
  role: SimRoleAssignment,
  dt: number,
): void {
  state.reevalTimer -= dt;

  const atDest = state.dest && dist2d(mover.x, mover.z, state.dest.x, state.dest.z) < 0.3;
  if (state.reevalTimer <= 0 || !state.dest || atDest) {
    const zone = role.zone;
    let bestX = role.homeX;
    let bestZ = role.homeZ;
    let bestLanes = -1;

    for (let i = 0; i < LAUNCHER_EVAL_SAMPLES; i++) {
      const cx = zone.xMin + Math.random() * (zone.xMax - zone.xMin);
      const cz = zone.zMin + Math.random() * (zone.zMax - zone.zMin);

      let clearLanes = 0;
      for (let ti = 0; ti < receivers.length; ti++) {
        const tgt = receivers[ti];
        let blocked = false;
        for (const ob of obstacles) {
          if (isPhysicallyClose(ob, cx, cz, tgt.x, tgt.z) ||
              isTrajectoryInFOV(ob, cx, cz, tgt.x, tgt.z)) {
            blocked = true;
            break;
          }
        }
        if (!blocked) clearLanes++;
      }

      if (clearLanes > bestLanes) {
        bestLanes = clearLanes;
        bestX = cx;
        bestZ = cz;
        state.bestPassTargetIdx = 0;
      }
    }

    state.dest = { x: bestX, z: bestZ };
    state.reevalTimer = role.reevalInterval + Math.random() * 0.5;
  }

  // Phase H.25: on-ball は ON_BALL_DRIBBLE_SPEED (2.7m/s) で動く (mover.speed は base 0.9-1.2 で遅すぎ)
  moveTowardDest(mover, state.dest!, ON_BALL_DRIBBLE_SPEED, dt);
  // Phase H.23: on-ball プレイヤーには zone 拘束を適用しない。
  //   キャッチ位置や drive 中にゾーン外へ出ても、強制 snap でワープさせない。
  //   ゾーン外へ大きく外れた場合は dest 再評価 (上の reevalTimer ロジック) で
  //   ゾーン内へ「向かう」目的地を出すので、motion 層が dt-bounded に戻す。
}

/**
 * SG / SECOND_HANDLER: wing positioning with pressure-based re-evaluation
 *  @param paintTime Phase H.12: 現在の paint 蓄積秒 (3秒違反回避用)
 */
export function moveSecondHandler(
  tgt: SimMover,
  dest: { x: number; z: number } | null,
  reevalTimer: number,
  dt: number,
  launcher: SimMover,
  obstacles: SimMover[],
  otherTargets: SimMover[],
  zSign: 1 | -1 = 1,
  paintTime: number = 0,
): { dest: { x: number; z: number }; reevalTimer: number } {
  const role = getMirroredRole(ROLE_ASSIGNMENTS.targets[0], zSign);
  reevalTimer -= dt;

  // Pressure check: re-evaluate immediately if obstacle too close
  let underPressure = false;
  for (const ob of obstacles) {
    if (dist2d(tgt.x, tgt.z, ob.x, ob.z) < OPEN_THRESHOLD) {
      underPressure = true;
      break;
    }
  }

  const atDest = dest && dist2d(tgt.x, tgt.z, dest.x, dest.z) < 0.3;
  // Phase H.24: paint 蓄積中は即時再評価。閾値 1.0 → 0.5 に短縮 (退出時間を確保)
  const paintUrgent = paintTime > 0.5;
  // Phase H.24: 現在の dest が paint 内なら (scheme override 等の引きずり) 即再評価
  const destInPaint = isDestInOffenseGoalPaint(dest);
  if (reevalTimer <= 0 || !dest || atDest || underPressure || paintUrgent || destInPaint) {
    dest = findOpenSpaceInZone(role.zone, launcher, obstacles, otherTargets, role.homeX, role.homeZ, 20, paintTime);
    reevalTimer = role.reevalInterval + Math.random() * 0.5;
  }

  moveTowardDest(tgt, dest!, TARGET_RANDOM_SPEED * role.speedMult, dt);
  clampToZone(tgt, role.zone);
  return { dest, reevalTimer };
}

/**
 * SF / SLASHER: V-cut movement (zone <-> goal direction oscillation)
 *  @param paintTime Phase H.12: 現在の paint 蓄積秒 (3秒違反回避用)
 */
export function moveSlasher(
  tgt: SimMover,
  state: SlasherState,
  dt: number,
  launcher: SimMover,
  obstacles: SimMover[],
  otherTargets: SimMover[],
  zSign: 1 | -1 = 1,
  paintTime: number = 0,
): void {
  const role = getMirroredRole(ROLE_ASSIGNMENTS.targets[1], zSign);
  state.vcutPhase += (dt / SLASHER_VCUT_PERIOD) * Math.PI * 2;
  if (state.vcutPhase > Math.PI * 2) state.vcutPhase -= Math.PI * 2;

  state.reevalTimer -= dt;

  const sinVal = Math.sin(state.vcutPhase);
  // Phase H.24: paint 蓄積が高ければ cut phase を強制スキップ。閾値 1.5 → 1.0
  const shouldExitPaint = paintTime > 1.0;
  if (sinVal > 0.5 && !shouldExitPaint) {
    // Cut phase: move toward basket (zSign direction)
    state.vcutActive = true;
    const cutX = role.homeX;
    const cutZ = role.homeZ + SLASHER_VCUT_AMPLITUDE * zSign;
    state.dest = { x: cutX, z: cutZ };
  } else {
    // Reset phase: return to open space in zone
    // Phase H.24: dest が paint 内ならスキーム override の引きずり等で再評価
    const destInPaint = isDestInOffenseGoalPaint(state.dest);
    if (state.vcutActive || state.reevalTimer <= 0 || !state.dest || shouldExitPaint || destInPaint) {
      state.dest = findOpenSpaceInZone(role.zone, launcher, obstacles, otherTargets, role.homeX, role.homeZ, 20, paintTime);
      state.reevalTimer = role.reevalInterval + Math.random() * 0.5;
    }
    state.vcutActive = false;
  }

  const speed = TARGET_RANDOM_SPEED * role.speedMult * (state.vcutActive ? 1.3 : 1.0);
  moveTowardDest(tgt, state.dest!, speed, dt);
  // During V-cut, allow movement beyond zone toward basket
  if (!state.vcutActive) {
    clampToZone(tgt, role.zone);
  } else {
    // Extended zone during cut (expand toward basket)
    const extZone: SimZone = zSign === 1
      ? { xMin: role.zone.xMin, xMax: role.zone.xMax, zMin: role.zone.zMin, zMax: role.zone.zMax + SLASHER_VCUT_AMPLITUDE + 0.5 }
      : { xMin: role.zone.xMin, xMax: role.zone.xMax, zMin: role.zone.zMin - SLASHER_VCUT_AMPLITUDE - 0.5, zMax: role.zone.zMax };
    clampToZone(tgt, extZone);
  }
}

/**
 * C / SCREENER: screen position -> pick & pop
 */
export function moveScreener(
  tgt: SimMover,
  state: ScreenerState,
  dt: number,
  launcher: SimMover,
  obstacles: SimMover[],
  otherTargets: SimMover[],
  zSign: 1 | -1 = 1,
  paintTime: number = 0,
): void {
  const role = getMirroredRole(ROLE_ASSIGNMENTS.targets[2], zSign);
  state.reevalTimer -= dt;

  if (!state.screenSet) {
    // Phase 1: move to screen position (between launcher and basket)
    const screenX = launcher.x;
    const screenZ = launcher.z + SCREENER_OFFSET * zSign;
    state.dest = { x: screenX, z: screenZ };

    const distToScreen = dist2d(tgt.x, tgt.z, screenX, screenZ);
    if (distToScreen < 0.3) {
      state.screenSet = true;
      state.holdTimer = 1.5 + Math.random() * 1.0;
    }
  } else if (state.holdTimer > 0) {
    // Phase H.25: hold 中でも自身が paint 内なら hold 中断 (3秒違反回避)
    //   rim クラッシュ override 後など hold 開始時点で paint 在のケース。
    const tgtInPaint = (() => {
      const goalSide: 1 | -1 = getGoalZ() > 0 ? 1 : -1;
      return isInPaint(tgt.x, tgt.z, goalSide);
    })();
    if (tgtInPaint || paintTime > 0.5) {
      // hold を破棄して phase 2 へ (open space モード継続)
      //   screenSet=true のまま holdTimer=0 にすると次フレーム以降 phase 2 に入る。
      //   screenSet=false にすると phase 1 (screen pos = launcher 付近) に戻り
      //   launcher が paint 近くにいると再び paint dest になるため避ける。
      state.holdTimer = 0;
      state.dest = findOpenSpaceInZone(role.zone, launcher, obstacles, otherTargets, role.homeX, role.homeZ, 20, paintTime);
      state.reevalTimer = role.reevalInterval + Math.random() * 0.5;
      // fall through to moveTowardDest 下部 (本フレームから移動開始)
    } else {
      // Hold screen position
      state.holdTimer -= dt;
      tgt.vx = 0;
      tgt.vz = 0;
      moveWithFacing(tgt, 0, dt);
      return;
    }
  } else {
    // Phase 2: pop to open space (pick & pop)
    // Phase H.24: dest paint check + paint 蓄積 (screen 位置が paint 化した場合の脱出)
    const destInPaint = isDestInOffenseGoalPaint(state.dest);
    const exitPaintUrgent = paintTime > 1.0;
    if (state.reevalTimer <= 0 || !state.dest || destInPaint || exitPaintUrgent) {
      state.dest = findOpenSpaceInZone(role.zone, launcher, obstacles, otherTargets, role.homeX, role.homeZ, 20, paintTime);
      state.reevalTimer = role.reevalInterval + Math.random() * 0.5;
      state.screenSet = false; // Reset cycle
    }
  }

  moveTowardDest(tgt, state.dest!, TARGET_RANDOM_SPEED * role.speedMult, dt);
  clampToZone(tgt, role.zone);
}

/**
 * PF / DUNKER: post-up with seal against nearest defender
 */
export function moveDunker(
  tgt: SimMover,
  state: DunkerState,
  dt: number,
  launcher: SimMover,
  obstacles: SimMover[],
  otherTargets: SimMover[],
  zSign: 1 | -1 = 1,
  paintTime: number = 0,
): void {
  const role = getMirroredRole(ROLE_ASSIGNMENTS.targets[3], zSign);
  state.reevalTimer -= dt;

  // Phase H.24: paint 蓄積が高ければ seal 中断して外に出る。閾値 1.5 → 1.0
  const shouldExitPaint = paintTime > 1.0;

  // Find nearest obstacle near zone
  let nearestOb: SimMover | null = null;
  let nearestDist = Infinity;
  for (const ob of obstacles) {
    const d = dist2d(tgt.x, tgt.z, ob.x, ob.z);
    if (d < nearestDist) {
      nearestDist = d;
      nearestOb = ob;
    }
  }

  if (nearestOb && nearestDist < OPEN_THRESHOLD * 2 && !shouldExitPaint) {
    // Seal: position between defender and basket (zSign direction)
    state.sealing = true;
    const dx = nearestOb.x - tgt.x;
    const dz = nearestOb.z - tgt.z;
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    const sealX = nearestOb.x + (dx / d) * DUNKER_SEAL_DIST * 0.3;
    const sealZ = nearestOb.z + DUNKER_SEAL_DIST * zSign;
    state.dest = { x: sealX, z: sealZ };
  } else {
    state.sealing = false;
    // Phase H.24: dest paint check (scheme override 等の引きずり対策)
    const destInPaint = isDestInOffenseGoalPaint(state.dest);
    if (state.reevalTimer <= 0 || !state.dest || shouldExitPaint || destInPaint) {
      state.dest = findOpenSpaceInZone(role.zone, launcher, obstacles, otherTargets, role.homeX, role.homeZ, 20, paintTime);
      state.reevalTimer = role.reevalInterval + Math.random() * 0.5;
    }
  }

  moveTowardDest(tgt, state.dest!, TARGET_RANDOM_SPEED * role.speedMult, dt);
  clampToZone(tgt, role.zone);
}
