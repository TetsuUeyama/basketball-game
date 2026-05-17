'use client';

/**
 * 試合日画面 — 試合前確認 + スタメン表示
 * ウイイレの試合前画面風
 */

import type { SeasonState, SeasonMatch } from './Types';
import { PHASE_LABELS } from './Types';
import { SeasonManager } from './SeasonManager';

interface MatchDayViewProps {
  state: SeasonState;
  match: SeasonMatch;
  onPlay: () => void;
  onSimulate: () => void;
}

export function MatchDayView({ state, match, onPlay, onSimulate }: MatchDayViewProps) {
  const homeTeam = state.teams.find(t => t.id === match.homeTeamId);
  const awayTeam = state.teams.find(t => t.id === match.awayTeamId);

  if (!homeTeam || !awayTeam) return null;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr.replace(/-/g, '/'));
    const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} (${dow})`;
  };

  const positionLabel: Record<string, string> = {
    PG: 'PG', SG: 'SG', SF: 'SF', PF: 'PF', C: 'C',
  };

  return (
    <div className="flex-1 p-6 flex flex-col">
      {/* ヘッダー */}
      <div className="text-center mb-8">
        <div className="text-xs text-blue-400 font-bold tracking-[0.3em] uppercase mb-1">
          Match Day
        </div>
        <div className="text-sm text-slate-400">
          {PHASE_LABELS[match.phase]}　{formatDate(match.date)}
        </div>
      </div>

      {/* 対戦カード - 大きく */}
      <div className="flex items-center justify-center gap-12 mb-8">
        {/* ホームチーム */}
        <div className="text-center">
          <div className="text-3xl font-bold text-white tracking-wider mb-1">
            {homeTeam.abbr}
          </div>
          <div className="text-sm text-slate-400">{homeTeam.name}</div>
          {match.homeTeamId === state.playerTeamId && (
            <div className="text-[10px] text-orange-400 font-bold mt-1">YOUR TEAM</div>
          )}
        </div>

        {/* VS区切り */}
        <div className="flex flex-col items-center">
          <div className="w-px h-8 bg-slate-700" />
          <div className="text-slate-600 text-lg font-bold my-2">VS</div>
          <div className="w-px h-8 bg-slate-700" />
        </div>

        {/* アウェイチーム */}
        <div className="text-center">
          <div className="text-3xl font-bold text-white tracking-wider mb-1">
            {awayTeam.abbr}
          </div>
          <div className="text-sm text-slate-400">{awayTeam.name}</div>
          {match.awayTeamId === state.playerTeamId && (
            <div className="text-[10px] text-orange-400 font-bold mt-1">YOUR TEAM</div>
          )}
        </div>
      </div>

      {/* スタメン */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        {/* ホーム */}
        <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-700/20">
          <h3 className="text-[10px] text-slate-500 font-bold tracking-widest mb-3">
            HOME LINEUP
          </h3>
          <div className="space-y-1.5">
            {homeTeam.players.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-blue-400 font-bold w-6 text-right text-xs">
                  {positionLabel[p.position]}
                </span>
                <span className="text-slate-300">
                  Player #{p.playerId}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* アウェイ */}
        <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-700/20">
          <h3 className="text-[10px] text-slate-500 font-bold tracking-widest mb-3">
            AWAY LINEUP
          </h3>
          <div className="space-y-1.5">
            {awayTeam.players.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-red-400 font-bold w-6 text-right text-xs">
                  {positionLabel[p.position]}
                </span>
                <span className="text-slate-300">
                  Player #{p.playerId}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* アクションボタン */}
      <div className="flex items-center justify-center gap-4 mt-auto">
        <button
          onClick={onPlay}
          className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors tracking-wide cursor-pointer"
        >
          試合開始
        </button>
        <button
          onClick={onSimulate}
          className="px-8 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold rounded-lg transition-colors tracking-wide cursor-pointer"
        >
          SIMで消化
        </button>
      </div>
    </div>
  );
}
