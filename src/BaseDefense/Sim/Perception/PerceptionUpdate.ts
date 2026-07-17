/**
 * PerceptionUpdate — 毎tickの知覚判定。
 *
 * - 兵士 × 侵入者: 視界（首向き基準・遮蔽込み）→ 視認記憶・suspicion更新
 * - 監視カメラ × 侵入者: 視界 → camera_detect イベント
 * - 音イベント × 兵士: 聴取判定 → stimulus（調査手掛かり）・suspicion更新
 * - 侵入者 × 兵士/カメラ: 侵入者側の脅威学習（knownThreats）
 *
 * イベントは立ち上がり（未視認→視認）のみ記録し、座標を必ず残す。
 * suspicion の蓄積はここで行い、FSM遷移（行動変化）は Phase 3 の DefenderFSM が担う。
 */

import type { SimState, Soldier, SecurityCamera, MoveMode } from '../Core/SimState';
import { pushEvent } from '../Core/SimEvents';
import { canSee, recordSighting } from './Vision';
import { canHear, makeSound } from './Hearing';
import type { SoundKind } from './Hearing';
import { isOccluded } from '../Map/Occlusion';
import {
  SOLDIER_VISION,
  CAMERA_VISION,
  INTRUDER_VISION,
  SOUND_RADIUS,
  SOUND_WALL_ATTENUATION,
  SOUND_LIFETIME_SEC,
  FOOTSTEP_INTERVAL_SEC,
} from '../Config/PerceptionConfig';
import { ALERT } from '../Config/AlertConfig';
import { clamp } from '../Core/MathUtils';

export function updatePerception(state: SimState, dt: number): void {
  const occl = (ax: number, az: number, bx: number, bz: number) =>
    isOccluded(state.map, ax, az, bx, bz);

  // ---- 兵士の視覚 ----
  for (const s of state.soldiers) {
    if (!s.alive) continue;
    updateSoldierVision(state, s, occl, dt);
  }

  // ---- 監視カメラの視覚 ----
  for (const c of state.cameras) {
    if (c.disabled) continue;
    updateCameraVision(state, c, occl);
  }

  // ---- 音 × 兵士 ----
  for (const sound of state.sounds) {
    for (const s of state.soldiers) {
      if (!s.alive) continue;
      if (s.id === sound.emitterId) continue;
      if (sound.heardBy.has(s.id)) continue;
      // 自軍の足音は無視（誰の音か分からない設定はPhase 3以降で検討）
      if (isSoldierSound(state, sound.emitterId)) {
        sound.heardBy.add(s.id);
        continue;
      }
      if (canHear(state.map, sound, s.x, s.z, SOUND_WALL_ATTENUATION)) {
        sound.heardBy.add(s.id);
        s.stimulus = { x: sound.x, z: sound.z, time: state.time };
        s.suspicion = clamp(s.suspicion + ALERT.riseOnSound, 0, 2);
        pushEvent(state.events, {
          time: state.time,
          kind: 'sound_heard',
          actorId: s.id,
          targetId: sound.emitterId,
          x: sound.x,
          z: sound.z,
          detail: sound.kind,
        });
      }
    }
  }

  // ---- 侵入者側の脅威学習（全知にしない — 自分の視界で見た警備だけ知る） ----
  for (const i of state.intruders) {
    if (!i.alive) continue;
    for (const s of state.soldiers) {
      if (!s.alive) continue;
      const tier = canSee(
        { x: i.x, z: i.z, neckFacing: i.neckFacing },
        s, INTRUDER_VISION, occl,
      );
      if (tier !== 'none') {
        recordSighting(i.knownThreats, s.id, s.x, s.z, tier, state.time);
      }
    }
  }
}

function updateSoldierVision(
  state: SimState,
  s: Soldier,
  occl: (ax: number, az: number, bx: number, bz: number) => boolean,
  dt: number,
): void {
  let sawSomeone = false;
  for (const i of state.intruders) {
    if (!i.alive || i.phase === 'done') {
      s.visibleIntruders.delete(i.id);
      continue;
    }
    const tier = canSee(
      { x: s.x, z: s.z, neckFacing: s.neckFacing },
      i, SOLDIER_VISION, occl,
    );
    const wasVisible = s.visibleIntruders.has(i.id);
    if (tier !== 'none') {
      sawSomeone = true;
      recordSighting(s.visionMemory, i.id, i.x, i.z, tier, state.time);
      s.stimulus = { x: i.x, z: i.z, time: state.time };
      const rise = tier === 'central' ? ALERT.riseCentralPerSec : ALERT.risePeripheralPerSec;
      s.suspicion = clamp(s.suspicion + rise * dt, 0, 2);
      if (!wasVisible) {
        s.visibleIntruders.add(i.id);
        pushEvent(state.events, {
          time: state.time,
          kind: 'sighting',
          actorId: s.id,
          targetId: i.id,
          x: i.x,
          z: i.z,
          detail: tier,
        });
      }
    } else if (wasVisible) {
      s.visibleIntruders.delete(i.id);
      pushEvent(state.events, {
        time: state.time,
        kind: 'sighting_lost',
        actorId: s.id,
        targetId: i.id,
        x: i.x,
        z: i.z,
      });
    }
  }
  // 何も見えていない間は疑念が自然減衰
  if (!sawSomeone) {
    s.suspicion = clamp(s.suspicion - ALERT.decayPerSec * dt, 0, 2);
  }
}

function updateCameraVision(
  state: SimState,
  c: SecurityCamera,
  occl: (ax: number, az: number, bx: number, bz: number) => boolean,
): void {
  for (const i of state.intruders) {
    if (!i.alive || i.phase === 'done') {
      c.visibleIntruders.delete(i.id);
      continue;
    }
    const tier = canSee(
      { x: c.x, z: c.z, neckFacing: c.facing },
      i, CAMERA_VISION, occl,
    );
    const wasVisible = c.visibleIntruders.has(i.id);
    if (tier !== 'none') {
      if (!wasVisible) {
        c.visibleIntruders.add(i.id);
        pushEvent(state.events, {
          time: state.time,
          kind: 'camera_detect',
          actorId: c.id,
          targetId: i.id,
          x: i.x,
          z: i.z,
        });
      }
    } else if (wasVisible) {
      c.visibleIntruders.delete(i.id);
    }
  }
}

function isSoldierSound(state: SimState, emitterId: number): boolean {
  return state.soldiers.some((s) => s.id === emitterId);
}

// =========================================================================
// 足音の発生
// =========================================================================

/**
 * 移動量に応じて足音イベントを発生させる。
 * sneak は無音（radius 0）。移動していない間はタイマーをリセット。
 */
export function emitFootsteps(
  state: SimState,
  agent: { id: number; x: number; z: number; footstepTimer: number },
  moveMode: MoveMode,
  moved: number,
  dt: number,
): void {
  if (moved <= 0.001) {
    agent.footstepTimer = FOOTSTEP_INTERVAL_SEC[moveMode];
    return;
  }
  agent.footstepTimer -= dt;
  if (agent.footstepTimer > 0) return;
  agent.footstepTimer = FOOTSTEP_INTERVAL_SEC[moveMode];

  const radius = moveMode === 'run' ? SOUND_RADIUS.run
    : moveMode === 'walk' ? SOUND_RADIUS.walk
    : SOUND_RADIUS.sneak;
  if (radius <= 0) return; // 忍び足は無音

  const kind: SoundKind = moveMode === 'run' ? 'run' : 'footstep';
  state.sounds.push(
    makeSound(
      state.nextSoundId++,
      agent.x, agent.z, radius, kind, agent.id,
      state.time, SOUND_LIFETIME_SEC,
    ),
  );
}

/** Phase 4 以降で使う明示的な発音（ドア・銃声など） */
export function emitSound(
  state: SimState,
  x: number,
  z: number,
  kind: SoundKind,
  emitterId: number,
): void {
  const radius =
    kind === 'gunshot' ? SOUND_RADIUS.gunshot
    : kind === 'door' ? SOUND_RADIUS.door
    : kind === 'melee' ? SOUND_RADIUS.melee
    : SOUND_RADIUS.walk;
  state.sounds.push(
    makeSound(state.nextSoundId++, x, z, radius, kind, emitterId, state.time, SOUND_LIFETIME_SEC),
  );
}
