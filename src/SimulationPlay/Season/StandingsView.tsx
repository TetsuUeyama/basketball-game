'use client';

/**
 * 順位表画面 — リーグテーブル表示
 */

import type { SeasonState, SeasonPhase } from './Types';
import { PHASE_LABELS } from './Types';
import { SeasonManager } from './SeasonManager';

interface StandingsViewProps {
  state: SeasonState;
}

export function StandingsView({ state }: StandingsViewProps) {
  const leaguePhase: SeasonPhase = (
    state.currentPhase === 'fallLeague' ||
    state.currentPhase === 'prelimTournament' ||
    state.currentPhase === 'finalTournament'
  ) ? 'fallLeague' : 'springLeague';

  const standings = leaguePhase === 'fallLeague'
    ? state.fallStandings
    : state.springStandings;

  return (
    <div className="flex-1 p-6">
      <h2 className="text-lg font-bold text-slate-200 tracking-wide mb-4">
        {PHASE_LABELS[leaguePhase]} 順位表
      </h2>

      <div className="bg-slate-800/40 rounded-lg border border-slate-700/20 overflow-hidden">
        {/* ヘッダー */}
        <div className="grid grid-cols-[2rem_1fr_3rem_3rem_4rem_4rem_3.5rem] gap-2 px-4 py-2 border-b border-slate-700/30 text-[10px] text-slate-500 font-bold tracking-widest">
          <span className="text-center">#</span>
          <span>TEAM</span>
          <span className="text-center">W</span>
          <span className="text-center">L</span>
          <span className="text-right">PF</span>
          <span className="text-right">PA</span>
          <span className="text-right">DIFF</span>
        </div>

        {/* チーム行 */}
        {standings.map((s, i) => {
          const isPlayer = s.teamId === state.playerTeamId;
          const isTop4 = i < 4;

          return (
            <div
              key={s.teamId}
              className={`grid grid-cols-[2rem_1fr_3rem_3rem_4rem_4rem_3.5rem] gap-2 px-4 py-2.5 border-b border-slate-700/10 transition-colors ${
                isPlayer
                  ? 'bg-blue-900/20 border-l-2 border-l-orange-400'
                  : ''
              }`}
            >
              <span className={`text-center text-sm font-bold ${
                isTop4 ? 'text-blue-400' : 'text-slate-600'
              }`}>
                {i + 1}
              </span>

              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold ${
                  isPlayer ? 'text-orange-300' : 'text-slate-200'
                }`}>
                  {SeasonManager.getTeamAbbr(state, s.teamId)}
                </span>
                <span className={`text-xs ${
                  isPlayer ? 'text-orange-400/70' : 'text-slate-500'
                }`}>
                  {SeasonManager.getTeamName(state, s.teamId)}
                </span>
              </div>

              <span className="text-center text-sm text-slate-300 font-bold">
                {s.wins}
              </span>
              <span className="text-center text-sm text-slate-400">
                {s.losses}
              </span>
              <span className="text-right text-sm text-slate-400">
                {s.pointsFor}
              </span>
              <span className="text-right text-sm text-slate-400">
                {s.pointsAgainst}
              </span>
              <span className={`text-right text-sm font-bold ${
                s.pointDiff > 0 ? 'text-green-400' : s.pointDiff < 0 ? 'text-red-400' : 'text-slate-500'
              }`}>
                {s.pointDiff > 0 ? '+' : ''}{s.pointDiff}
              </span>
            </div>
          );
        })}

        {/* 注釈 */}
        <div className="px-4 py-2 text-[10px] text-slate-600">
          * 上位4チームがリーグ内トーナメントに進出
        </div>
      </div>
    </div>
  );
}
