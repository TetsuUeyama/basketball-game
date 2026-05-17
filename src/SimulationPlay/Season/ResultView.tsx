'use client';

/**
 * 試合結果画面 — 結果 + 他チーム結果 + 順位表サマリ
 */

import type { SeasonState, SeasonMatch } from './Types';
import { SeasonManager } from './SeasonManager';

interface ResultViewProps {
  state: SeasonState;
  matchId: number;
  onContinue: () => void;
}

export function ResultView({ state, matchId, onContinue }: ResultViewProps) {
  const match = state.matches.find(m => m.id === matchId);





  
  if (!match?.result) return null;

  const isPlayerWin =
    (match.homeTeamId === state.playerTeamId && match.result.winner === 'home') ||
    (match.awayTeamId === state.playerTeamId && match.result.winner === 'away');

  const homeName = SeasonManager.getTeamName(state, match.homeTeamId);
  const awayName = SeasonManager.getTeamName(state, match.awayTeamId);

  // 同日の他試合結果
  const otherResults = state.matches.filter(
    m => m.date === match.date && m.id !== match.id && m.result,
  );

  // 現在の順位表（上位4チーム）
  const standings = SeasonManager.getCurrentStandings(state).slice(0, 4);

  return (
    <div className="flex-1 p-6 flex flex-col items-center">
      {/* 結果ヘッダー */}
      <div className="text-center mb-6">
        <div className={`text-xs font-bold tracking-[0.3em] uppercase mb-2 ${
          match.isPlayerMatch
            ? (isPlayerWin ? 'text-yellow-400' : 'text-red-400')
            : 'text-slate-400'
        }`}>
          {match.isPlayerMatch
            ? (isPlayerWin ? 'Victory' : 'Defeat')
            : 'Result'
          }
        </div>
      </div>

      {/* スコア */}
      <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 rounded-xl p-8 border border-slate-700/30 mb-6 w-full max-w-md">
        <div className="flex items-center justify-center gap-6">
          <div className="text-center">
            <div className="text-lg font-bold text-white mb-1">{homeName}</div>
            <div className={`text-4xl font-bold ${
              match.result.winner === 'home' ? 'text-yellow-400' : 'text-slate-400'
            }`}>
              {match.result.homeScore}
            </div>
          </div>
          <div className="text-slate-600 text-lg">-</div>
          <div className="text-center">
            <div className="text-lg font-bold text-white mb-1">{awayName}</div>
            <div className={`text-4xl font-bold ${
              match.result.winner === 'away' ? 'text-yellow-400' : 'text-slate-400'
            }`}>
              {match.result.awayScore}
            </div>
          </div>
        </div>
      </div>

      {/* 他の試合結果 */}
      {otherResults.length > 0 && (
        <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-700/20 mb-6 w-full max-w-md">
          <h3 className="text-[10px] text-slate-500 font-bold tracking-widest mb-3">
            OTHER RESULTS
          </h3>
          <div className="space-y-2">
            {otherResults.map(m => (
              <div key={m.id} className="flex items-center justify-between text-sm">
                <span className={`text-slate-300 w-20 text-right ${
                  m.result!.winner === 'home' ? 'font-bold text-white' : ''
                }`}>
                  {SeasonManager.getTeamAbbr(state, m.homeTeamId)}
                </span>
                <span className="text-slate-500 mx-2">
                  {m.result!.homeScore} - {m.result!.awayScore}
                </span>
                <span className={`text-slate-300 w-20 ${
                  m.result!.winner === 'away' ? 'font-bold text-white' : ''
                }`}>
                  {SeasonManager.getTeamAbbr(state, m.awayTeamId)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 順位表サマリ */}
      <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-700/20 mb-6 w-full max-w-md">
        <h3 className="text-[10px] text-slate-500 font-bold tracking-widest mb-3">
          STANDINGS
        </h3>
        <div className="space-y-1">
          {standings.map((s, i) => (
            <div
              key={s.teamId}
              className={`flex items-center justify-between text-sm py-0.5 ${
                s.teamId === state.playerTeamId ? 'text-orange-400 font-bold' : 'text-slate-400'
              }`}
            >
              <span className="w-6 text-right">{i + 1}.</span>
              <span className="flex-1 ml-2">{SeasonManager.getTeamName(state, s.teamId)}</span>
              <span className="w-16 text-right">{s.wins}W {s.losses}L</span>
            </div>
          ))}
        </div>
      </div>

      {/* 次へ */}
      <button
        onClick={onContinue}
        className="px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg transition-colors tracking-wide cursor-pointer"
      >
        次へ進む
      </button>
    </div>
  );
}
