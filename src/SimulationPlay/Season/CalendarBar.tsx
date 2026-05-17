'use client';

/**
 * 上部カレンダーバー（ウイイレ マスターリーグ風）
 * 横スクロールの日付バー、試合日にマーカー表示
 */

import { useMemo } from 'react';
import type { SeasonState } from './Types';

interface CalendarBarProps {
  state: SeasonState;
}

const DOW_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function dateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function CalendarBar({ state }: CalendarBarProps) {
  // 現在日を中心に前後7日を表示
  const days = useMemo(() => {
    const center = parseDate(state.currentDate);
    const result: Date[] = [];
    for (let i = -5; i <= 8; i++) {
      const d = new Date(center);
      d.setDate(d.getDate() + i);
      result.push(d);
    }
    return result;
  }, [state.currentDate]);

  // 試合日セット
  const matchDates = useMemo(() => {
    return new Set(state.matches.map(m => m.date));
  }, [state.matches]);

  // プレイヤーの試合日セット
  const playerMatchDates = useMemo(() => {
    return new Set(state.matches.filter(m => m.isPlayerMatch).map(m => m.date));
  }, [state.matches]);

  // 済み試合日セット
  const completedDates = useMemo(() => {
    const dates = new Set<string>();
    // 日ごとにグループ化し、全試合が結果ありなら済み
    const byDate = new Map<string, boolean>();
    for (const m of state.matches) {
      const current = byDate.get(m.date);
      if (current === undefined) {
        byDate.set(m.date, m.result !== null);
      } else {
        byDate.set(m.date, current && m.result !== null);
      }
    }
    for (const [date, allDone] of byDate) {
      if (allDone) dates.add(date);
    }
    return dates;
  }, [state.matches]);

  const currentMonth = parseDate(state.currentDate).getMonth() + 1;

  return (
    <div className="bg-gradient-to-r from-slate-800/80 via-slate-800/60 to-slate-800/80 border-b border-slate-700/50">
      {/* 月表示 */}
      <div className="flex items-center justify-center pt-2 pb-1">
        <span className="text-xs text-slate-500 tracking-widest">
          {parseDate(state.currentDate).getFullYear()}年{currentMonth}月
        </span>
      </div>

      {/* 日付バー */}
      <div className="flex items-end justify-center gap-0 px-2 pb-2">
        {days.map((day) => {
          const ds = dateStr(day);
          const isToday = ds === state.currentDate;
          const dow = day.getDay();
          const isMatch = matchDates.has(ds);
          const isPlayerMatch = playerMatchDates.has(ds);
          const isDone = completedDates.has(ds);

          return (
            <div
              key={ds}
              className={`flex flex-col items-center w-[52px] py-1.5 transition-all ${
                isToday
                  ? 'bg-blue-900/60 rounded-lg scale-105'
                  : ''
              }`}
            >
              {/* 曜日 */}
              <span className={`text-[10px] leading-none ${
                dow === 0 ? 'text-red-400' : dow === 6 ? 'text-blue-400' : 'text-slate-500'
              }`}>
                {DOW_NAMES[dow]}
              </span>

              {/* 日 */}
              <span className={`text-sm font-bold leading-tight mt-0.5 ${
                isToday ? 'text-white' : 'text-slate-400'
              }`}>
                {day.getDate()}
              </span>

              {/* マーカー */}
              <div className="h-3 flex items-center justify-center mt-0.5">
                {isPlayerMatch && !isDone && (
                  <div className="w-2 h-2 rounded-full bg-orange-400 shadow-lg shadow-orange-400/50" />
                )}
                {isMatch && !isPlayerMatch && !isDone && (
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                )}
                {isDone && (
                  <span className="text-[8px] text-green-500">&#10003;</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
