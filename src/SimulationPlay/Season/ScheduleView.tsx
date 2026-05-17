'use client';

/**
 * 日程表画面 — ウイイレのリーグ日程表風
 * 全節の試合と結果を一覧表示
 */

import type { SeasonState, SeasonPhase } from './Types';
import { PHASE_LABELS } from './Types';
import { SeasonManager } from './SeasonManager';

interface ScheduleViewProps {
  state: SeasonState;
}

export function ScheduleView({ state }: ScheduleViewProps) {
  // 現在のフェーズに対応するリーグの試合を表示
  const leaguePhase: SeasonPhase = (
    state.currentPhase === 'fallLeague' ||
    state.currentPhase === 'prelimTournament' ||
    state.currentPhase === 'finalTournament'
  ) ? 'fallLeague' : 'springLeague';

  const phaseMatches = state.matches.filter(m => m.phase === leaguePhase);
  const rounds = [...new Set(phaseMatches.map(m => m.round))].sort((a, b) => a - b);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr.replace(/-/g, '/'));
    const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
    return `${d.getMonth() + 1}/${d.getDate()}(${dow})`;
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <h2 className="text-lg font-bold text-slate-200 tracking-wide mb-4">
        {PHASE_LABELS[leaguePhase]} 日程
      </h2>

      <div className="space-y-4">
        {rounds.map(round => {
          const roundMatches = phaseMatches.filter(m => m.round === round);
          const date = roundMatches[0]?.date;
          const allDone = roundMatches.every(m => m.result !== null);
          const isCurrent = date === state.currentDate;
          const isPast = date < state.currentDate;

          return (
            <div
              key={round}
              className={`bg-slate-800/40 rounded-lg border transition-colors ${
                isCurrent
                  ? 'border-blue-500/40 bg-blue-900/20'
                  : 'border-slate-700/20'
              }`}
            >
              {/* 節ヘッダー */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700/20">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-slate-300">
                    第{round + 1}節
                  </span>
                  <span className="text-xs text-slate-500">
                    {date && formatDate(date)}
                  </span>
                </div>
                <span className={`text-[10px] font-bold tracking-widest ${
                  allDone
                    ? 'text-green-500'
                    : isCurrent ? 'text-blue-400' : 'text-slate-600'
                }`}>
                  {allDone ? 'COMPLETED' : isCurrent ? 'MATCH DAY' : isPast ? '---' : 'UPCOMING'}
                </span>
              </div>

              {/* 試合一覧 */}
              <div className="px-4 py-2 space-y-1">
                {roundMatches.map(m => (
                  <div
                    key={m.id}
                    className={`flex items-center justify-between py-1 text-sm ${
                      m.isPlayerMatch ? 'text-orange-300' : 'text-slate-400'
                    }`}
                  >
                    <span className={`w-24 text-right ${
                      m.result?.winner === 'home' ? 'font-bold text-white' : ''
                    }${m.isPlayerMatch && m.homeTeamId === state.playerTeamId ? ' text-orange-300' : ''}`}>
                      {SeasonManager.getTeamAbbr(state, m.homeTeamId)}
                    </span>

                    {m.result ? (
                      <span className="text-slate-500 mx-3 w-16 text-center">
                        {m.result.homeScore} - {m.result.awayScore}
                      </span>
                    ) : (
                      <span className="text-slate-600 mx-3 w-16 text-center">
                        - vs -
                      </span>
                    )}

                    <span className={`w-24 ${
                      m.result?.winner === 'away' ? 'font-bold text-white' : ''
                    }${m.isPlayerMatch && m.awayTeamId === state.playerTeamId ? ' text-orange-300' : ''}`}>
                      {SeasonManager.getTeamAbbr(state, m.awayTeamId)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
