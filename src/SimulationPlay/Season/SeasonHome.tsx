'use client';

/**
 * シーズンシミュレーション メイン画面
 * ウイイレ マスターリーグ風レイアウト:
 *   上部: カレンダーバー
 *   左: サイドメニュー
 *   中央: コンテンツエリア
 *   下部: ニュースティッカー + 操作ボタン
 */

import { useState, useCallback, useEffect } from 'react';
import type { SeasonState, SeasonView, SeasonMatchResult } from './Types';
import { PHASE_LABELS } from './Types';
import { SeasonManager } from './SeasonManager';
import { CalendarBar } from './CalendarBar';
import { HomeView } from './HomeView';
import { MatchDayView } from './MatchDayView';
import { ResultView } from './ResultView';
import { ScheduleView } from './ScheduleView';
import { StandingsView } from './StandingsView';

// ===== サイドメニュー =====

interface SideMenuProps {
  currentView: SeasonView;
  onSelect: (view: SeasonView) => void;
}

const MENU_ITEMS: { view: SeasonView; label: string; sub: string }[] = [
  { view: 'home', label: 'ホーム', sub: 'HOME' },
  { view: 'match', label: '試合', sub: 'MATCH' },
  { view: 'schedule', label: '日程', sub: 'SCHEDULE' },
  { view: 'standings', label: '順位表', sub: 'STANDINGS' },
  { view: 'roster', label: '選手', sub: 'ROSTER' },
];

function SideMenu({ currentView, onSelect }: SideMenuProps) {
  return (
    <div className="w-36 bg-slate-900/80 border-r border-slate-700/30 flex flex-col pt-4 shrink-0">
      {MENU_ITEMS.map(item => {
        const active = currentView === item.view;
        return (
          <button
            key={item.view}
            onClick={() => onSelect(item.view)}
            className={`text-left px-4 py-3 transition-all relative cursor-pointer ${
              active
                ? 'bg-slate-800/60 text-white'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
            }`}
          >
            {/* アクティブインジケーター */}
            {active && (
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-blue-400" />
            )}
            <div className="text-sm font-bold">{item.label}</div>
            <div className="text-[9px] tracking-[0.15em] text-slate-600 mt-0.5">
              {item.sub}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ===== ニュースティッカー =====

function NewsTicker({ state }: { state: SeasonState }) {
  const [index, setIndex] = useState(0);
  const news = state.news;

  useEffect(() => {
    if (news.length <= 1) return;
    const timer = setInterval(() => {
      setIndex(prev => (prev + 1) % news.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [news.length]);

  if (news.length === 0) return null;
  const item = news[index];

  return (
    <div className="bg-slate-900/80 border-t border-slate-700/30 px-4 py-2 flex items-center gap-3 overflow-hidden">
      <span className="text-[10px] text-blue-400 font-bold tracking-widest shrink-0">
        NEWS
      </span>
      <span className="text-xs text-slate-400 truncate">
        {item.text}
      </span>
    </div>
  );
}

// ===== メインコンポーネント =====

interface SeasonHomeProps {
  initialState: SeasonState;
  onBack: () => void;
}

export function SeasonHome({ initialState, onBack }: SeasonHomeProps) {
  const [state, setState] = useState<SeasonState>(initialState);
  const [currentView, setCurrentView] = useState<SeasonView>('home');
  const [resultMatchId, setResultMatchId] = useState<number | null>(null);

  // 次の日へ進む
  const handleAdvance = useCallback(() => {
    let updated = SeasonManager.advanceToNextEvent(state);
    // AI試合を自動消化
    updated = SeasonManager.simulateDayMatches(updated);
    setState(updated);

    // プレイヤーの試合日ならマッチ画面に
    const playerMatch = SeasonManager.getPlayerTodayMatch(updated);
    if (playerMatch && !playerMatch.result) {
      setCurrentView('match');
    } else {
      setCurrentView('home');
    }
  }, [state]);

  // 試合をSIMで消化
  const handleSimulate = useCallback(() => {
    const playerMatch = SeasonManager.getPlayerTodayMatch(state);
    if (!playerMatch) return;

    // プレイヤーの試合もAI消化
    const result: SeasonMatchResult = {
      homeScore: Math.floor(Math.random() * 40) + 60,
      awayScore: Math.floor(Math.random() * 40) + 60,
      winner: 'home',
    };
    if (result.homeScore === result.awayScore) result.awayScore += 1;
    result.winner = result.homeScore > result.awayScore ? 'home' : 'away';

    let updated = SeasonManager.applyMatchResult(state, playerMatch.id, result);
    // 他のAI試合も消化
    updated = SeasonManager.simulateDayMatches(updated);
    setState(updated);
    setResultMatchId(playerMatch.id);
    setCurrentView('result');
  }, [state]);

  // 試合開始（3D試合ページへ — 現時点ではSIM代用）
  const handlePlay = useCallback(() => {
    // TODO: 3D試合への遷移。今はSIMで代用
    handleSimulate();
  }, [handleSimulate]);

  // 結果画面から次へ
  const handleContinueFromResult = useCallback(() => {
    setResultMatchId(null);
    setCurrentView('home');
  }, []);

  // 今日のプレイヤー試合
  const playerMatch = SeasonManager.getPlayerTodayMatch(state);
  const hasPlayerMatch = playerMatch && !playerMatch.result;

  // コンテンツエリアのレンダリング
  const renderContent = () => {
    if (currentView === 'result' && resultMatchId !== null) {
      return (
        <ResultView
          state={state}
          matchId={resultMatchId}
          onContinue={handleContinueFromResult}
        />
      );
    }

    if (currentView === 'match' && hasPlayerMatch) {
      return (
        <MatchDayView
          state={state}
          match={playerMatch}
          onPlay={handlePlay}
          onSimulate={handleSimulate}
        />
      );
    }

    switch (currentView) {
      case 'schedule':
        return <ScheduleView state={state} />;
      case 'standings':
        return <StandingsView state={state} />;
      case 'roster':
        return (
          <div className="flex-1 p-6">
            <h2 className="text-lg font-bold text-slate-200 mb-4">選手一覧</h2>
            <p className="text-slate-500 text-sm">準備中...</p>
          </div>
        );
      default:
        return <HomeView state={state} />;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-b from-slate-900 via-gray-950 to-black text-white overflow-hidden">
      {/* 上部: タイトルバー */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/90 border-b border-slate-700/30">
        <button
          onClick={onBack}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
        >
          ← 戻る
        </button>
        <div className="text-center">
          <span className="text-xs text-slate-400 tracking-widest">
            BASKETBALL SEASON {state.year}
          </span>
        </div>
        <div className="text-xs text-slate-500">
          {PHASE_LABELS[state.currentPhase]}
        </div>
      </div>

      {/* カレンダーバー */}
      <CalendarBar state={state} />

      {/* メインエリア: 左メニュー + 中央コンテンツ */}
      <div className="flex flex-1 min-h-0">
        <SideMenu currentView={currentView} onSelect={setCurrentView} />
        <div className="flex-1 overflow-y-auto">
          {renderContent()}
        </div>
      </div>

      {/* ニュースティッカー */}
      <NewsTicker state={state} />

      {/* 操作バー */}
      <div className="bg-slate-900/90 border-t border-slate-700/30 px-6 py-3 flex items-center justify-between">
        <div className="text-xs text-slate-600">
          {state.currentDate.replace(/-/g, '.')}
        </div>

        <div className="flex gap-3">
          {hasPlayerMatch ? (
            <>
              <button
                onClick={() => setCurrentView('match')}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded transition-colors cursor-pointer"
              >
                試合へ進む
              </button>
            </>
          ) : (
            <button
              onClick={handleAdvance}
              className="px-5 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold rounded transition-colors cursor-pointer"
              disabled={state.currentPhase === 'seasonEnd'}
            >
              次の日へ
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
