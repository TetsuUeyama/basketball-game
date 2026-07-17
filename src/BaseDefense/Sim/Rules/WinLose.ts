/**
 * WinLose — 勝敗判定。
 *
 * 侵入側勝利: いずれかの侵入者が機密を持って離脱ゾーンに到達
 * 防衛側勝利: 侵入者を全員排除 / 全員が手ぶらで離脱 / 制限時間切れ
 */

import type { SimState } from '../Core/SimState';
import { pushEvent } from '../Core/SimEvents';

export function checkWinLose(state: SimState): void {
  if (state.outcome) return;

  // 侵入側勝利: 機密を持った離脱者がいる
  const intelOut = state.intruders.find((i) => i.phase === 'done' && i.carryingIntel);
  if (intelOut) {
    setOutcome(state, 'intruder', 'objective_exfiltrated', intelOut.x, intelOut.z);
    return;
  }

  // 全侵入者が死亡または離脱済み → 防衛側勝利
  const active = state.intruders.some((i) => i.alive && i.phase !== 'done');
  if (!active) {
    const allDead = state.intruders.every((i) => !i.alive);
    setOutcome(state, 'defender', allDead ? 'all_eliminated' : 'intruders_retreated', 0, 0);
    return;
  }

  // 時間切れ → 防衛側勝利
  if (state.time >= state.timeLimitSec) {
    setOutcome(state, 'defender', 'timeout', 0, 0);
  }
}

function setOutcome(
  state: SimState,
  winner: 'intruder' | 'defender',
  reason: string,
  x: number,
  z: number,
): void {
  state.outcome = { winner, reason, time: state.time };
  pushEvent(state.events, {
    time: state.time,
    kind: 'match_end',
    x, z,
    detail: `${winner}:${reason}`,
  });
}
