/**
 * SimLoop — シミュレーションの毎tick更新オーケストレータ。
 *
 * 順序: 無線配送 → 兵士FSM → カメラ首振り → 侵入者AI
 *     → 重なり分離 → 知覚判定 → 音の寿命処理 → 勝敗判定。
 * Babylon 非依存。View からもヘッドレスハーネスからも同じ関数を呼ぶ。
 */

import type { SimState } from './SimState';
import { normAngleDiff } from './MathUtils';
import { updateDefender } from '../AI/DefenderFSM';
import { updateIntruderAI } from '../AI/IntruderAI';
import { processRadio } from '../AI/RadioNet';
import { separateAgents } from '../Movement/MovementCore';
import { updatePerception } from '../Perception/PerceptionUpdate';
import { checkWinLose } from '../Rules/WinLose';

export function updateSim(state: SimState, dt: number): void {
  if (state.outcome) return;
  state.time += dt;
  state.tick++;

  // ---- 無線の配送（受信者の stimulus / suspicion を更新 → FSMが反応） ----
  processRadio(state);

  // ---- 兵士: 警戒FSM（PATROL→SUSPICIOUS→SEARCH→COMBAT） ----
  for (const s of state.soldiers) {
    if (!s.alive) continue;
    updateDefender(state, s, dt);
  }

  // ---- 監視カメラ: 首振り ----
  for (const c of state.cameras) {
    if (c.disabled || !c.sweep) continue;
    c.facing += c.sweep.speed * c.sweep.dir * dt;
    const rel = normAngleDiff(c.sweep.center, c.facing);
    if (rel > c.sweep.halfArc) {
      c.facing = c.sweep.center + c.sweep.halfArc;
      c.sweep.dir = -1;
    } else if (rel < -c.sweep.halfArc) {
      c.facing = c.sweep.center - c.sweep.halfArc;
      c.sweep.dir = 1;
    }
  }

  // ---- 侵入者: 隠密進行 / 逃走 ----
  for (const i of state.intruders) {
    updateIntruderAI(state, i, dt);
  }

  // ---- 重なり分離 ----
  const aliveAgents = [
    ...state.soldiers.filter((s) => s.alive),
    ...state.intruders.filter((i) => i.alive && i.phase !== 'done'),
  ];
  separateAgents(aliveAgents, state.map);

  // ---- 知覚 ----
  updatePerception(state, dt);

  // ---- 音の寿命処理 ----
  if (state.sounds.length > 0) {
    state.sounds = state.sounds.filter((snd) => snd.expiresAt > state.time);
  }

  // ---- 勝敗 ----
  checkWinLose(state);
}
