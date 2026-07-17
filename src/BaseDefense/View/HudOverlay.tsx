/**
 * HudOverlay — 経過時間・兵士警戒状態・イベントログ・勝敗の表示。
 * 純粋な表示コンポーネント（データは ScenePanel が SimState から抽出して渡す）。
 */

'use client';

import type { SoldierFsmState } from '@/BaseDefense/Sim/Core/SimState';

export interface HudData {
  time: number;
  timeLimit: number;
  outcome: { winner: 'intruder' | 'defender'; reason: string; time: number } | null;
  soldiers: { id: number; state: SoldierFsmState; suspicion: number }[];
  recentEvents: string[];
}

const STATE_LABEL: Record<SoldierFsmState, string> = {
  PATROL: '巡回',
  SUSPICIOUS: '警戒',
  SEARCH: '捜索',
  COMBAT: '戦闘',
};

const STATE_COLOR: Record<SoldierFsmState, string> = {
  PATROL: 'text-blue-400',
  SUSPICIOUS: 'text-yellow-400',
  SEARCH: 'text-orange-400',
  COMBAT: 'text-red-400',
};

export function HudOverlay({ data, onReset }: { data: HudData; onReset: () => void }) {
  const mm = Math.floor(data.time / 60);
  const ss = Math.floor(data.time % 60).toString().padStart(2, '0');

  return (
    <>
      {/* 左上: 時間・兵士状態 */}
      <div className="absolute top-3 left-3 bg-black/60 text-white rounded px-3 py-2 text-sm font-mono select-none">
        <div className="text-lg">
          {mm}:{ss} <span className="text-gray-400 text-xs">/ {Math.floor(data.timeLimit / 60)}:00</span>
        </div>
        {data.soldiers.map((s) => (
          <div key={s.id} className="flex gap-2 items-center">
            <span>兵士{s.id}</span>
            <span className={STATE_COLOR[s.state]}>{STATE_LABEL[s.state]}</span>
            <span className="text-gray-400">
              疑念 {(Math.min(s.suspicion, 1) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>

      {/* 右上: リセット */}
      <div className="absolute top-3 right-3">
        <button
          onClick={onReset}
          className="bg-gray-700 hover:bg-gray-600 text-white text-sm rounded px-3 py-1.5"
        >
          リスタート
        </button>
      </div>

      {/* 左下: イベントログ */}
      <div className="absolute bottom-3 left-3 bg-black/60 text-gray-200 rounded px-3 py-2 text-xs font-mono max-w-md select-none">
        {data.recentEvents.length === 0 ? (
          <div className="text-gray-500">イベントなし</div>
        ) : (
          data.recentEvents.map((ev, i) => <div key={i}>{ev}</div>)
        )}
      </div>

      {/* 中央: 勝敗 */}
      {data.outcome && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/75 text-white rounded-lg px-8 py-6 text-center">
            <div className="text-2xl font-bold mb-1">
              {data.outcome.winner === 'defender' ? '防衛成功' : '侵入成功'}
            </div>
            <div className="text-sm text-gray-300">
              {outcomeReasonLabel(data.outcome.reason)}（{Math.floor(data.outcome.time)}秒）
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function outcomeReasonLabel(reason: string): string {
  switch (reason) {
    case 'objective_exfiltrated': return '機密が持ち出された';
    case 'all_eliminated': return '侵入者を全員排除';
    case 'intruders_retreated': return '侵入者は手ぶらで撤退';
    case 'timeout': return '時間内に侵入を阻止';
    default: return reason;
  }
}
