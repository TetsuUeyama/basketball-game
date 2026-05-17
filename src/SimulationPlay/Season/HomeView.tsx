'use client';

/**
 * ホーム画面 — 次の試合情報 + チーム概況
 * ウイイレ マスターリーグのメイン画面風
 */

import type { SeasonState } from './Types';
import { PHASE_LABELS } from './Types';
import { SeasonManager } from './SeasonManager';

interface HomeViewProps {
  state: SeasonState;
}

export function HomeView({ state }: HomeViewProps) {
  const playerMatch = SeasonManager.getPlayerTodayMatch(state);
  const nextMatch = playerMatch ?? SeasonManager.getNextPlayerMatch(state);
  const todayMatches = SeasonManager.getTodayMatches(state);
  const otherMatches = todayMatches.filter(m => !m.isPlayerMatch);
  const record = SeasonManager.getPlayerRecord(state);
  const rank = SeasonManager.getPlayerRank(state);
  const progress = SeasonManager.getPhaseProgress(state);
  const playerTeamName = SeasonManager.getTeamName(state, state.playerTeamId);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr.replace(/-/g, '/'));
    const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} (${dow})`;
  };

  return (
    <div className="flex-1 p-6 space-y-6">
      {/* フェーズ表示 */}
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-bold text-slate-200 tracking-wide">
          {PHASE_LABELS[state.currentPhase]}
        </h2>
        {progress.total > 0 && (
          <span className="text-xs text-slate-500">
            第{progress.current + 1}節 / 全{progress.total}節
          </span>
        )}
      </div>

      {/* 次の試合カード */}
      {nextMatch && (
        <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 rounded-xl p-6 border border-slate-700/30">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs text-blue-400 font-bold tracking-widest uppercase">
              Next Match
            </span>
            <span className="text-xs text-slate-500">
              {formatDate(nextMatch.date)}
            </span>
          </div>

          {/* 対戦カード */}
          <div className="flex items-center justify-center gap-8 py-4">
            {/* ホーム */}
            <div className="text-center">
              <div className="text-2xl font-bold text-white mb-1">
                {SeasonManager.getTeamAbbr(state, nextMatch.homeTeamId)}
              </div>
              <div className="text-sm text-slate-400">
                {SeasonManager.getTeamName(state, nextMatch.homeTeamId)}
              </div>
              {nextMatch.homeTeamId === state.playerTeamId && (
                <span className="text-[10px] text-orange-400 font-bold mt-1 block">HOME</span>
              )}
            </div>

            {/* VS */}
            <div className="text-slate-600 text-xl font-bold">vs</div>

            {/* アウェイ */}
            <div className="text-center">
              <div className="text-2xl font-bold text-white mb-1">
                {SeasonManager.getTeamAbbr(state, nextMatch.awayTeamId)}
              </div>
              <div className="text-sm text-slate-400">
                {SeasonManager.getTeamName(state, nextMatch.awayTeamId)}
              </div>
              {nextMatch.awayTeamId === state.playerTeamId && (
                <span className="text-[10px] text-orange-400 font-bold mt-1 block">AWAY</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* チーム状況 + 他の試合 横並び */}
      <div className="grid grid-cols-2 gap-4">
        {/* チーム状況 */}
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/20">
          <h3 className="text-xs text-slate-500 font-bold tracking-widest mb-3">TEAM STATUS</h3>
          <div className="text-sm text-white font-bold mb-2">{playerTeamName}</div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">戦績</span>
              <span className="text-white font-bold">{record.wins}勝 {record.losses}敗</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">順位</span>
              <span className="text-white font-bold">{rank}位 / 8チーム</span>
            </div>
          </div>
        </div>

        {/* 他の試合 */}
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/20">
          <h3 className="text-xs text-slate-500 font-bold tracking-widest mb-3">OTHER MATCHES</h3>
          {otherMatches.length > 0 ? (
            <div className="space-y-1.5">
              {otherMatches.map(m => (
                <div key={m.id} className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">
                    {SeasonManager.getTeamAbbr(state, m.homeTeamId)}
                  </span>
                  <span className="text-slate-600 mx-1">vs</span>
                  <span className="text-slate-300">
                    {SeasonManager.getTeamAbbr(state, m.awayTeamId)}
                  </span>
                  {m.result && (
                    <span className="text-slate-500 ml-2">
                      {m.result.homeScore}-{m.result.awayScore}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <span className="text-xs text-slate-600">本日の試合はありません</span>
          )}
        </div>
      </div>
    </div>
  );
}
