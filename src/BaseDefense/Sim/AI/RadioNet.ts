/**
 * RadioNet — 検知情報の遅延付き無線共有。
 *
 * 兵士のCOMBAT突入・監視カメラの検知時に「最終目撃位置」をブロードキャストし、
 * ALERT.radioDelaySec 後に他の兵士へ配送する。受信した兵士は疑念が確信レベルに
 * 跳ね上がり、DefenderFSM が SEARCH（現地へ収束）へ遷移させる。
 */

import type { SimState } from '../Core/SimState';
import { pushEvent } from '../Core/SimEvents';
import { ALERT } from '../Config/AlertConfig';
import { dist2d } from '../Core/MathUtils';

export interface RadioMessage {
  /** 発信者（兵士 or カメラ）のID */
  fromId: number;
  /** 報告された目撃位置 */
  x: number;
  z: number;
  sentAt: number;
  deliverAt: number;
}

/** 目撃情報をブロードキャストする（配送は processRadio が行う） */
export function broadcast(state: SimState, fromId: number, x: number, z: number): void {
  state.radio.push({
    fromId,
    x,
    z,
    sentAt: state.time,
    deliverAt: state.time + ALERT.radioDelaySec,
  });
}

/** 配送時刻に達したメッセージを各兵士へ配る */
export function processRadio(state: SimState): void {
  if (state.radio.length === 0) return;
  const remaining: RadioMessage[] = [];
  for (const msg of state.radio) {
    if (msg.deliverAt > state.time) {
      remaining.push(msg);
      continue;
    }
    for (const s of state.soldiers) {
      if (!s.alive || s.id === msg.fromId) continue;
      if (ALERT.radioRange > 0 && dist2d(s.x, s.z, msg.x, msg.z) > ALERT.radioRange) continue;
      // 既に交戦/捜索中の兵士は自分の情報を優先（上書きしない）
      if (s.fsm.state === 'COMBAT' || s.fsm.state === 'SEARCH') continue;
      s.stimulus = { x: msg.x, z: msg.z, time: state.time };
      // 確信閾値ちょうどだと次tickの自然減衰で割り込んで SEARCH に入れないため、
      // 余裕を持たせる（無線=確認済み情報）
      s.suspicion = Math.max(s.suspicion, ALERT.confirmThreshold + 0.25);
      pushEvent(state.events, {
        time: state.time,
        kind: 'radio',
        actorId: s.id,
        targetId: msg.fromId,
        x: msg.x,
        z: msg.z,
      });
    }
  }
  state.radio = remaining;
}
