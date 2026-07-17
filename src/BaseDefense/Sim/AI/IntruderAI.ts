/**
 * IntruderAI — 侵入者の隠密行動と逃走。
 *
 * 隠密進行（infiltrate/exfiltrate）:
 *  - 自分の視界に入っている兵士＋（設置位置を把握している）監視カメラの
 *    「視界コーン」を脅威として評価する — 全知にしない
 *  - 進行方向の先読み位置がコーンに入るなら、その場で待機（忍び足=無音）
 *  - 待機が holdTimeoutSec を超えたら強行突破（dashSec の間走り抜ける）
 *  - コーンの近くでは忍び足に落として足音を消す
 *
 * 逃走（flee）: 被弾・銃声・COMBAT状態の兵士が近くに見えたら
 * 最寄りの離脱ゾーンへ全力疾走。機密を持っていれば持ち逃げ。
 */

import type { SimState, Intruder, SecurityCamera } from '../Core/SimState';
import { pushEvent } from '../Core/SimEvents';
import { angleOf, dirX, dirZ, dist2d, normAngleDiff } from '../Core/MathUtils';
import { moveTowards, turnNeckToward, effectiveArrive } from '../Movement/MovementCore';
import { canSee } from '../Perception/Vision';
import type { VisionParams } from '../Perception/Vision';
import { isOccluded } from '../Map/Occlusion';
import { emitFootsteps } from '../Perception/PerceptionUpdate';
import {
  INTRUDER,
  SOLDIER,
  WAYPOINT_ARRIVE_DIST,
  CAN_SABOTAGE,
} from '../Config/AgentConfig';
import {
  SOLDIER_VISION,
  CAMERA_VISION,
  INTRUDER_VISION,
  SOUND_RADIUS,
} from '../Config/PerceptionConfig';

/** 目標（機密）の取得判定距離 (m) */
const OBJECTIVE_REACH_DIST = 1.2;

interface ThreatCone {
  kind: 'soldier' | 'camera';
  /** カメラの場合は SecurityCamera.id（サボタージュ対象の特定に使う） */
  id?: number;
  x: number;
  z: number;
  facing: number;
  params: VisionParams;
}

export function updateIntruderAI(state: SimState, i: Intruder, dt: number): void {
  if (!i.alive || i.phase === 'done') return;

  // ---- 脅威シグナル（被弾・銃声・交戦兵の視認）----
  const tookDamage = i.hp < i.lastKnownHp;
  i.lastKnownHp = i.hp;
  const gunshotHeard = state.sounds.some(
    (snd) => snd.kind === 'gunshot' &&
      dist2d(snd.x, snd.z, i.x, i.z) <= snd.radius,
  );
  const combatSoldierNear = state.soldiers.some(
    (s) =>
      s.alive &&
      s.fsm.state === 'COMBAT' &&
      dist2d(s.x, s.z, i.x, i.z) <= INTRUDER.stealth.fleeCombatDist &&
      canSeeThreat(state, i, s.x, s.z),
  );
  const threatened = tookDamage || gunshotHeard || combatSoldierNear;
  if (threatened) i.lastThreatAt = state.time;

  // ---- 逃走トリガー ----
  if (i.phase !== 'flee' && threatened) {
    i.phase = 'flee';
    pushEvent(state.events, {
      time: state.time,
      kind: 'fsm_change',
      actorId: i.id,
      x: i.x,
      z: i.z,
      detail: 'intruder->flee',
    });
  }

  // ---- 逃走 ----
  if (i.phase === 'flee') {
    // 機密未入手なら、脅威が収まった時点で任務を再開する（プロは一瞥で帰らない）
    if (
      !i.carryingIntel &&
      state.time - i.lastThreatAt >= INTRUDER.stealth.resumeAfterCalmSec
    ) {
      i.phase = 'infiltrate';
      i.retreatIdx = null;
      i.holdSince = null;
      pushEvent(state.events, {
        time: state.time,
        kind: 'fsm_change',
        actorId: i.id,
        x: i.x,
        z: i.z,
        detail: 'intruder->resume',
      });
      return;
    }
    i.moveMode = 'run';
    // 離脱ゾーン到達時: 機密持ち or 重傷なら退場。
    // 軽傷で手ぶらなら安全地帯で身を潜めて熱が冷めるのを待つ（上の再開判定が拾う）
    const zoneHit = state.map.exfilZones.find(
      (z) => dist2d(i.x, i.z, z.x, z.z) <= z.r,
    );
    if (zoneHit) {
      if (
        i.carryingIntel ||
        i.hp <= INTRUDER.hp * INTRUDER.stealth.woundedRetreatHpRatio
      ) {
        exitMap(state, i);
        return;
      }
      i.moveMode = 'sneak';
      neckFollow(i, state.time, dt);
      return;
    }
    // 既知の侵入経路を逆走して入口へ戻る
    // （最寄り離脱ゾーンへの直線逃走は建物の壁でスタックするため不可）
    let tx: number;
    let tz: number;
    const fleeArrive = effectiveArrive(INTRUDER.speed.run, INTRUDER.turnRate, WAYPOINT_ARRIVE_DIST);
    if (i.pathIdx > 0) {
      const j = i.pathIdx - 1;
      const back = i.path[j];
      if (dist2d(i.x, i.z, back.x, back.z) <= fleeArrive) {
        i.pathIdx = j; // 到達 → さらに一つ前へ
      }
      tx = back.x;
      tz = back.z;
    } else {
      const zone = nearestExfil(state, i);
      tx = zone.x;
      tz = zone.z;
    }
    const r = moveTowards(
      i, tx, tz,
      INTRUDER.speed.run, INTRUDER.turnRate, dt,
      state.map, i.radius, WAYPOINT_ARRIVE_DIST,
    );
    neckFollow(i, state.time, dt);
    emitFootsteps(state, i, 'run', r.moved, dt);
    return;
  }

  // ---- サボタージュ作業中（カメラ背後へ回り込み → 至近で作業） ----
  if (i.sabotageTargetId !== null) {
    if (updateSabotage(state, i, dt)) return;
    // 中断された場合はそのまま通常の隠密進行へフォールスルー
  }

  // ---- 隠密進行 ----
  const wp = i.path[Math.min(i.pathIdx, i.path.length - 1)];
  const threats = collectThreatCones(state, i);
  const st = INTRUDER.stealth;

  const coveringNow = threats.filter((t) =>
    coneCovers(state, t, i.x, i.z, st.coneMarginDist, st.coneMarginAngle),
  );
  const nowInCone = coveringNow.length > 0;
  const moveAngle = angleOf(wp.x - i.x, wp.z - i.z);
  const aheadX = i.x + dirX(moveAngle) * st.lookaheadDist;
  const aheadZ = i.z + dirZ(moveAngle) * st.lookaheadDist;
  const aheadBlockers = threats.filter((t) =>
    coneCovers(state, t, aheadX, aheadZ, st.coneMarginDist, st.coneMarginAngle),
  );
  const aheadInCone = aheadBlockers.length > 0;
  const soldierBlocksAhead = aheadBlockers.some((t) => t.kind === 'soldier');
  // カメラ用に始めたダッシュ中に兵士のコーンが塞いだら中止（銃口に向かって走らない）
  if (state.time < i.dashUntil && soldierBlocksAhead && !i.dashVsSoldier) {
    i.dashUntil = 0;
  }
  // カメラのコーン内にいる間＋抜けた直後はスプリント継続
  // （検知位置の通報から距離を取る — 捜索収束点の近くに留まらない）
  if (coveringNow.some((t) => t.kind === 'camera')) {
    i.dashUntil = Math.max(i.dashUntil, state.time + st.dashSec);
  }
  const dashing = state.time < i.dashUntil;

  let moved = 0;
  if (dashing || nowInCone) {
    // コーン内 or 強行突破中。
    // 進行方向側に兵士（コーンの主）がいる場合、前進＝銃口へ突進になるため
    // コーンから出るまで経路を遡り続ける（後退位置は retreatIdx で管理し、
    // 前進の進捗 pathIdx は保持する）
    const towardSoldier = coveringNow.find(
      (t) =>
        t.kind === 'soldier' &&
        Math.abs(normAngleDiff(moveAngle, angleOf(t.x - i.x, t.z - i.z))) < Math.PI / 2,
    );
    i.holdSince = null;
    if (!dashing && towardSoldier) {
      // 走行音(半径13m)が届かない距離なら走って後退、近ければ静かに歩いて後退
      const soldierDist = dist2d(towardSoldier.x, towardSoldier.z, i.x, i.z);
      i.moveMode = soldierDist > SOUND_RADIUS.run ? 'run' : 'walk';
      if (i.retreatIdx === null) i.retreatIdx = Math.max(i.pathIdx - 1, 0);
      const back = i.path[i.retreatIdx];
      const retreatArrive = effectiveArrive(
        INTRUDER.speed[i.moveMode], INTRUDER.turnRate, WAYPOINT_ARRIVE_DIST,
      );
      if (dist2d(i.x, i.z, back.x, back.z) <= retreatArrive && i.retreatIdx > 0) {
        i.retreatIdx--; // 到達してもまだコーン内 → さらに一つ前へ
      }
      moved = moveTowards(
        i, back.x, back.z,
        INTRUDER.speed[i.moveMode], INTRUDER.turnRate, dt,
        state.map, i.radius, WAYPOINT_ARRIVE_DIST,
      ).moved;
    } else {
      // 走行音(半径13m)が兵士に届く状況では静かに歩いて抜ける
      // （カメラ突破の足音で近くの巡回兵を呼び寄せない）
      const nearestSoldier = threats
        .filter((t) => t.kind === 'soldier')
        .reduce<number>(
          (min, t) => Math.min(min, dist2d(t.x, t.z, i.x, i.z)),
          Infinity,
        );
      i.moveMode = nearestSoldier <= SOUND_RADIUS.run ? 'walk' : 'run';
      moved = moveTowards(
        i, wp.x, wp.z,
        INTRUDER.speed[i.moveMode], INTRUDER.turnRate, dt,
        state.map, i.radius, WAYPOINT_ARRIVE_DIST,
      ).moved;
    }
  } else if (aheadInCone) {
    i.retreatIdx = null;
    const closeSoldier = aheadBlockers.find(
      (t) => t.kind === 'soldier' && dist2d(t.x, t.z, i.x, i.z) <= st.retreatDist,
    );
    if (closeSoldier) {
      // 至近の兵士に塞がれた → 凍結せず距離を取る（凍結は捜索で見つかる）
      i.moveMode = 'sneak';
      i.holdSince = null;
      const away = angleOf(i.x - closeSoldier.x, i.z - closeSoldier.z);
      moved = moveTowards(
        i, i.x + dirX(away) * 3, i.z + dirZ(away) * 3,
        INTRUDER.speed.walk, INTRUDER.turnRate, dt,
        state.map, i.radius, WAYPOINT_ARRIVE_DIST,
      ).moved;
    } else {
      // カメラだけに塞がれている場合、まず無効化を試みる
      // （コーンを横切らずに背後へ回り込めるなら強行突破よりそちらを選ぶ）
      if (CAN_SABOTAGE[i.kind] && !soldierBlocksAhead && i.sabotageTargetId === null) {
        const camBlock = aheadBlockers.find((t) => t.kind === 'camera' && t.id !== undefined);
        const cam = camBlock
          ? state.cameras.find((c) => c.id === camBlock.id && !c.disabled)
          : undefined;
        if (cam && sabotageFeasible(state, i, cam)) {
          i.sabotageTargetId = cam.id;
          i.sabotageSince = null;
          i.holdSince = null;
          i.moveMode = 'sneak';
          return; // 次tickから updateSabotage が処理
        }
      }
      // 進むと見つかる → 忍び足で静止して待つ（コーンが動くのを待つ）
      i.moveMode = 'sneak';
      if (i.holdSince === null) i.holdSince = state.time;
      // 兵士は動くので長めに待つ。カメラ等の固定脅威だけなら早めに強行突破
      const timeout = soldierBlocksAhead ? st.soldierHoldTimeoutSec : st.holdTimeoutSec;
      if (state.time - i.holdSince >= timeout) {
        // 待ちきれない → 強行突破へ
        i.dashUntil = state.time + st.dashSec;
        i.dashVsSoldier = soldierBlocksAhead;
        i.holdSince = null;
      }
      // 待機中は最寄りの脅威を注視
      const nearest = nearestThreat(threats, i);
      if (nearest) {
        i.neckFacing = turnNeckToward(
          i.facing, i.neckFacing, angleOf(nearest.x - i.x, nearest.z - i.z),
          SOLDIER.neckTurnRate * dt, SOLDIER.neckMaxAngle,
        );
      }
    }
  } else {
    // 安全 → 通常進行。コーンの近くでは忍び足で足音を消す
    i.holdSince = null;
    i.dashVsSoldier = false;
    i.retreatIdx = null;
    const nearCone =
      threats.some((t) =>
        coneCovers(state, t, i.x, i.z, st.sneakMarginDist, st.sneakMarginAngle),
      ) ||
      threats.some((t) =>
        coneCovers(state, t, aheadX, aheadZ, st.sneakMarginDist, st.sneakMarginAngle),
      );
    if (nearCone) {
      i.moveMode = 'sneak';
    } else if (i.carryingIntel) {
      // 機密入手後は一刻も早く離脱する。ただし兵士に走行音(13m)が届く距離では歩く
      const nearestSoldier = threats
        .filter((t) => t.kind === 'soldier')
        .reduce<number>((min, t) => Math.min(min, dist2d(t.x, t.z, i.x, i.z)), Infinity);
      i.moveMode = nearestSoldier > SOUND_RADIUS.run ? 'run' : 'walk';
    } else {
      i.moveMode = i.baseMoveMode;
    }
    moved = moveTowards(
      i, wp.x, wp.z,
      INTRUDER.speed[i.moveMode], INTRUDER.turnRate, dt,
      state.map, i.radius, WAYPOINT_ARRIVE_DIST,
    ).moved;
    neckFollow(i, state.time, dt);
  }

  emitFootsteps(state, i, i.moveMode, moved, dt);

  // ウェイポイント到達（到達半径は現在速度の実効値と揃える）
  if (
    dist2d(i.x, i.z, wp.x, wp.z) <=
      effectiveArrive(INTRUDER.speed[i.moveMode], INTRUDER.turnRate, WAYPOINT_ARRIVE_DIST) &&
    i.pathIdx < i.path.length - 1
  ) {
    i.pathIdx++;
  }

  // 機密の奪取
  if (
    i.phase === 'infiltrate' &&
    dist2d(i.x, i.z, state.map.objective.x, state.map.objective.z) <= OBJECTIVE_REACH_DIST
  ) {
    i.carryingIntel = true;
    i.phase = 'exfiltrate';
    pushEvent(state.events, {
      time: state.time,
      kind: 'objective_taken',
      actorId: i.id,
      x: i.x,
      z: i.z,
    });
  }

  // 離脱
  if (i.phase === 'exfiltrate') {
    for (const zone of state.map.exfilZones) {
      if (dist2d(i.x, i.z, zone.x, zone.z) <= zone.r) {
        exitMap(state, i);
        break;
      }
    }
  }
}

/** 侵入者が認識している脅威コーン一覧 */
function collectThreatCones(state: SimState, i: Intruder): ThreatCone[] {
  const cones: ThreatCone[] = [];
  // 兵士: 今まさに自分の視界に入っている者だけ（背後から近づく兵士は知らない）
  for (const s of state.soldiers) {
    if (!s.alive) continue;
    if (canSee({ x: i.x, z: i.z, neckFacing: i.neckFacing }, s, INTRUDER_VISION,
      (ax, az, bx, bz) => isOccluded(state.map, ax, az, bx, bz)) === 'none') continue;
    cones.push({ kind: 'soldier', x: s.x, z: s.z, facing: s.neckFacing, params: SOLDIER_VISION });
  }
  // 監視カメラ: 固定設備なので位置・向きは把握済みとする（事前偵察の想定）
  for (const c of state.cameras) {
    if (c.disabled) continue;
    cones.push({ kind: 'camera', id: c.id, x: c.x, z: c.z, facing: c.facing, params: CAMERA_VISION });
  }
  return cones;
}

/** 点 (x,z) が脅威コーン（マージン拡張込み）に覆われているか */
function coneCovers(
  state: SimState,
  t: ThreatCone,
  x: number,
  z: number,
  marginDist: number,
  marginAngle: number,
): boolean {
  const dx = x - t.x;
  const dz = z - t.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const maxRange = Math.max(t.params.centralRange, t.params.peripheralRange) + marginDist;
  if (dist > maxRange) return false;
  const angDiff = Math.abs(normAngleDiff(t.facing, angleOf(dx, dz)));
  const inCentral =
    angDiff <= t.params.centralHalfAngle + marginAngle &&
    dist <= t.params.centralRange + marginDist;
  const inPeripheral =
    angDiff <= t.params.peripheralHalfAngle + marginAngle &&
    dist <= t.params.peripheralRange + marginDist;
  if (!inCentral && !inPeripheral) return false;
  return !isOccluded(state.map, t.x, t.z, x, z);
}

function canSeeThreat(state: SimState, i: Intruder, x: number, z: number): boolean {
  return canSee(
    { x: i.x, z: i.z, neckFacing: i.neckFacing },
    { x, z }, INTRUDER_VISION,
    (ax, az, bx, bz) => isOccluded(state.map, ax, az, bx, bz),
  ) !== 'none';
}

function nearestThreat(threats: ThreatCone[], i: Intruder): ThreatCone | null {
  let best: ThreatCone | null = null;
  let bestDist = Infinity;
  for (const t of threats) {
    const d = dist2d(t.x, t.z, i.x, i.z);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}

function nearestExfil(state: SimState, i: Intruder) {
  let best = state.map.exfilZones[0];
  let bestDist = Infinity;
  for (const zone of state.map.exfilZones) {
    const d = dist2d(zone.x, zone.z, i.x, i.z);
    if (d < bestDist) {
      bestDist = d;
      best = zone;
    }
  }
  return best;
}

/** 進行方向を軸に首を振って周囲を索敵しながら進む（sim時間ベースの正弦 = 決定論） */
function neckFollow(i: Intruder, time: number, dt: number): void {
  const sweep = Math.sin(time * 1.3 + i.id) * SOLDIER.neckMaxAngle * 0.6;
  i.neckFacing = turnNeckToward(
    i.facing, i.neckFacing, i.facing + sweep,
    SOLDIER.neckTurnRate * dt, SOLDIER.neckMaxAngle,
  );
}

// =========================================================================
// カメラのサボタージュ（無効化）
// =========================================================================

/** カメラ背後の作業ポイント（レンズと逆側） */
function behindPoint(cam: SecurityCamera): { x: number; z: number } {
  const off = INTRUDER.sabotage.behindOffset;
  return {
    x: cam.x - dirX(cam.facing) * off,
    z: cam.z - dirZ(cam.facing) * off,
  };
}

function camConeOf(cam: SecurityCamera): ThreatCone {
  return { kind: 'camera', id: cam.id, x: cam.x, z: cam.z, facing: cam.facing, params: CAMERA_VISION };
}

/** 現在地から背後ポイントまで、対象カメラのコーンを横切らずに行けるか */
function sabotageFeasible(state: SimState, i: Intruder, cam: SecurityCamera): boolean {
  const behind = behindPoint(cam);
  const cone = camConeOf(cam);
  const steps = 12;
  for (let k = 0; k <= steps; k++) {
    const x = i.x + (behind.x - i.x) * (k / steps);
    const z = i.z + (behind.z - i.z) * (k / steps);
    if (coneCovers(state, cone, x, z, 0.3, 0.05)) return false;
  }
  return true;
}

function clearSabotage(i: Intruder): void {
  i.sabotageTargetId = null;
  i.sabotageSince = null;
}

/**
 * サボタージュの進行。true = このtickを処理した / false = 中断（通常フローへ）。
 * 背後ポイントへ忍び足で接近 → 至近で連続 timeSec 作業 → カメラ無効化。
 * 兵士のコーンに入った、または対象カメラのコーンに入りそうなら中断。
 */
function updateSabotage(state: SimState, i: Intruder, dt: number): boolean {
  const cam = state.cameras.find((c) => c.id === i.sabotageTargetId);
  if (!cam || cam.disabled) {
    clearSabotage(i);
    return false;
  }
  const st = INTRUDER.stealth;

  // 兵士のコーンに捕捉された、または視認した兵士が近づいてきたら中断して退避
  const soldierCones = collectThreatCones(state, i).filter((t) => t.kind === 'soldier');
  const soldierTooClose = soldierCones.some(
    (t) => dist2d(t.x, t.z, i.x, i.z) <= INTRUDER.sabotage.abortSoldierDist,
  );
  if (
    soldierTooClose ||
    soldierCones.some((t) =>
      coneCovers(state, t, i.x, i.z, st.coneMarginDist, st.coneMarginAngle),
    )
  ) {
    clearSabotage(i);
    return false;
  }

  const d = dist2d(i.x, i.z, cam.x, cam.z);
  if (d <= INTRUDER.sabotage.range) {
    // 作業中（静止・無音）。手元だけでなく周囲も見回して警戒する
    i.moveMode = 'sneak';
    if (i.sabotageSince === null) i.sabotageSince = state.time;
    const sweep = Math.sin(state.time * 1.8 + i.id) * SOLDIER.neckMaxAngle;
    i.neckFacing = turnNeckToward(
      i.facing, i.neckFacing, i.facing + sweep,
      SOLDIER.neckTurnRate * dt, SOLDIER.neckMaxAngle,
    );
    if (state.time - i.sabotageSince >= INTRUDER.sabotage.timeSec) {
      cam.disabled = true;
      cam.disabledAt = state.time;
      pushEvent(state.events, {
        time: state.time,
        kind: 'camera_disabled',
        actorId: i.id,
        targetId: cam.id,
        x: cam.x,
        z: cam.z,
      });
      clearSabotage(i);
    }
    return true;
  }

  // 背後ポイントへ接近。対象カメラのコーンに触れそうなら中断（見つかるくらいなら待つ）
  i.sabotageSince = null;
  const cone = camConeOf(cam);
  const behind = behindPoint(cam);
  const approachAngle = angleOf(behind.x - i.x, behind.z - i.z);
  const nx = i.x + dirX(approachAngle) * st.lookaheadDist;
  const nz = i.z + dirZ(approachAngle) * st.lookaheadDist;
  if (
    coneCovers(state, cone, i.x, i.z, 0.3, 0.05) ||
    coneCovers(state, cone, nx, nz, 0.3, 0.05)
  ) {
    clearSabotage(i);
    return false;
  }
  i.moveMode = 'sneak';
  const r = moveTowards(
    i, behind.x, behind.z,
    INTRUDER.speed.sneak, INTRUDER.turnRate, dt,
    state.map, i.radius, INTRUDER.sabotage.range * 0.7,
  );
  emitFootsteps(state, i, 'sneak', r.moved, dt);
  return true;
}

function exitMap(state: SimState, i: Intruder): void {
  i.phase = 'done';
  pushEvent(state.events, {
    time: state.time,
    kind: 'exfil',
    actorId: i.id,
    x: i.x,
    z: i.z,
    detail: i.carryingIntel ? 'with_intel' : 'empty_handed',
  });
}
