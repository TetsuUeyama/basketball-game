'use client';

/**
 * トップページ = シーズンモード
 * チーム選択 → シーズンホーム画面
 */

import { useState, useEffect } from 'react';
import type { SeasonState } from '@/SimulationPlay/Season/Types';
import { SeasonManager } from '@/SimulationPlay/Season/SeasonManager';
import { SeasonHome } from '@/SimulationPlay/Season/SeasonHome';
import { LEAGUE_TEAMS } from '@/SimulationPlay/Management/League/LeagueTeams';

export default function Home() {
  const [seasonState, setSeasonState] = useState<SeasonState | null>(null);
  const [loading, setLoading] = useState(true);

  // 既存のセーブデータを確認
  useEffect(() => {
    const saved = SeasonManager.load();
    if (saved) {
      setSeasonState(saved);
    }
    setLoading(false);
  }, []);

  // チーム選択してシーズン開始
  const handleStartSeason = (teamId: number) => {
    const state = SeasonManager.createSeason(teamId);
    setSeasonState(state);
  };

  // シーズンをリセット
  const handleBack = () => {
    SeasonManager.clear();
    setSeasonState(null);
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-950 text-slate-500">
        Loading...
      </div>
    );
  }

  // シーズン進行中
  if (seasonState) {
    return (
      <SeasonHome
        initialState={seasonState}
        onBack={handleBack}
      />
    );
  }

  // チーム選択画面
  return (
    <div className="h-screen flex flex-col bg-gradient-to-b from-slate-900 via-gray-950 to-black text-white">
      {/* ヘッダー */}
      <div className="flex items-center justify-center px-6 py-4 border-b border-slate-700/30">
        <span className="text-xs text-slate-400 tracking-widest">
          SEASON MODE
        </span>
      </div>

      {/* メインコンテンツ */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <h1 className="text-2xl font-bold text-white mb-2 tracking-wide">
          チームを選択
        </h1>
        <p className="text-sm text-slate-500 mb-8">
          シーズンを戦うチームを選んでください
        </p>

        <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
          {LEAGUE_TEAMS.map(team => (
            <button
              key={team.id}
              onClick={() => handleStartSeason(team.id)}
              className="bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/30 hover:border-blue-500/40 rounded-lg px-5 py-4 text-left transition-all group cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-bold text-white group-hover:text-blue-300 transition-colors">
                    {team.name}
                  </div>
                  <div className="text-xs text-slate-500 tracking-wider mt-0.5">
                    {team.abbr}
                  </div>
                </div>
                <div className="text-xs text-slate-600">
                  {team.defenseScheme}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
