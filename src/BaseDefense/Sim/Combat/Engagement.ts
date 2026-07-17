/**
 * Engagement — 射撃の解決。
 *
 * 発砲条件: クールダウン明け・射程内・照準角内・視線が通っている。
 * 命中率は距離で線形減衰（Config集約）。発砲は銃声（半径55m）を発する
 * ため、撃てば基地中の兵士と侵入者に伝わるトレードオフがある。
 */

import type { SimState, Soldier, Intruder } from '../Core/SimState';
import { pushEvent } from '../Core/SimEvents';
import { angleOf, clamp, dist2d, normAngleDiff } from '../Core/MathUtils';
import { isOccluded } from '../Map/Occlusion';
import { emitSound } from '../Perception/PerceptionUpdate';
import { SOLDIER } from '../Config/AgentConfig';

/** 条件を満たしていれば1発撃つ。命中判定・ダメージ・死亡まで解決する */
export function tryShoot(state: SimState, s: Soldier, target: Intruder): void {
  if (state.time < s.weapon.nextFireAt) return;

  const dist = dist2d(s.x, s.z, target.x, target.z);
  if (dist > SOLDIER.weapon.range) return;

  const targetAngle = angleOf(target.x - s.x, target.z - s.z);
  if (Math.abs(normAngleDiff(s.facing, targetAngle)) > SOLDIER.combat.aimTolerance) return;

  // 視線遮蔽壁越しには撃たない（フェンスは blocksVision=false なので撃ち抜ける）
  if (isOccluded(state.map, s.x, s.z, target.x, target.z)) return;

  s.weapon.nextFireAt = state.time + SOLDIER.weapon.cooldownSec;
  emitSound(state, s.x, s.z, 'gunshot', s.id);

  const c = SOLDIER.combat;
  let hitChance = clamp(
    c.accuracyBase - c.accuracyFalloff * (dist / SOLDIER.weapon.range),
    c.accuracyMin,
    c.accuracyBase,
  );
  if (target.moveMode === 'run') hitChance *= c.runTargetMult;
  const hit = state.rng() < hitChance;

  pushEvent(state.events, {
    time: state.time,
    kind: 'shot',
    actorId: s.id,
    targetId: target.id,
    x: target.x,
    z: target.z,
    detail: hit ? 'hit' : 'miss',
  });

  if (hit) {
    target.hp -= SOLDIER.weapon.damage;
    if (target.hp <= 0) {
      target.alive = false;
      pushEvent(state.events, {
        time: state.time,
        kind: 'kill',
        actorId: s.id,
        targetId: target.id,
        x: target.x,
        z: target.z,
      });
    }
  }
}
