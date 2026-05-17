/**
 * シーズン状態管理
 * 年間スケジュールの生成・進行・保存
 */

import type {
  SeasonState,
  SeasonMatch,
  SeasonDayEvent,
  SeasonPhase,
  LeagueStanding,
  SeasonMatchResult,
  SeasonNews,
  TournamentState,
  TournamentRound,
} from './Types';
import { LEAGUE_TEAMS } from '@/SimulationPlay/Management/League/LeagueTeams';
import { generateRoundRobinSchedule } from '@/SimulationPlay/Management/League/RoundRobinScheduler';

const STORAGE_KEY = 'basketball_season_state';

// ===== 日付ヘルパー =====

function dateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return dateStr(d);
}

function nextWeekday(from: string, weekday: number): string {
  const d = parseDate(from);
  d.setDate(d.getDate() + 1);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  return dateStr(d);
}

function firstWeekdayOnOrAfter(from: string, weekday: number): string {
  const d = parseDate(from);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  return dateStr(d);
}

function dayOfWeek(s: string): string {
  const names = ['日', '月', '火', '水', '木', '金', '土'];
  return names[parseDate(s).getDay()];
}

// ===== シーズン日程生成 =====

interface ScheduleSlot {
  date: string;
  phase: SeasonPhase;
  round: number;
  label: string;
}

function generateSeasonScheduleSlots(year: number): ScheduleSlot[] {
  const slots: ScheduleSlot[] = [];

  // 春リーグ（4月〜5月, 毎週土曜, 7節）
  let sat = firstWeekdayOnOrAfter(`${year}-04-01`, 6);
  for (let i = 0; i < 7; i++) {
    slots.push({ date: sat, phase: 'springLeague', round: i, label: `春リーグ第${i + 1}節` });
    sat = nextWeekday(sat, 6);
  }

  // リーグ内トーナメント（春リーグ後, 土・水）
  const ltSat = nextWeekday(slots[slots.length - 1].date, 6);
  slots.push({ date: ltSat, phase: 'leagueTournament', round: 0, label: 'リーグT 準決勝' });
  const ltWed = nextWeekday(ltSat, 3);
  slots.push({ date: ltWed, phase: 'leagueTournament', round: 1, label: 'リーグT 決勝' });

  // 秋リーグ（9月〜10月, 毎週土曜, 7節）
  sat = firstWeekdayOnOrAfter(`${year}-09-01`, 6);
  for (let i = 0; i < 7; i++) {
    slots.push({ date: sat, phase: 'fallLeague', round: i, label: `秋リーグ第${i + 1}節` });
    sat = nextWeekday(sat, 6);
  }

  // 予選トーナメント（秋リーグ後, 水・土・水）
  const pWed1 = nextWeekday(slots[slots.length - 1].date, 3);
  slots.push({ date: pWed1, phase: 'prelimTournament', round: 0, label: '予選1回戦' });
  const pSat = nextWeekday(pWed1, 6);
  slots.push({ date: pSat, phase: 'prelimTournament', round: 1, label: '予選2回戦' });
  const pWed2 = nextWeekday(pSat, 3);
  slots.push({ date: pWed2, phase: 'prelimTournament', round: 2, label: '予選決勝' });

  // 決勝トーナメント（土・水・土・日）
  const fSat1 = nextWeekday(pWed2, 6);
  slots.push({ date: fSat1, phase: 'finalTournament', round: 0, label: '決勝T 1回戦' });
  const fWed = nextWeekday(fSat1, 3);
  slots.push({ date: fWed, phase: 'finalTournament', round: 1, label: '準々決勝' });
  const fSat2 = nextWeekday(fWed, 6);
  slots.push({ date: fSat2, phase: 'finalTournament', round: 2, label: '準決勝' });
  const fSun = addDays(fSat2, 1);
  slots.push({ date: fSun, phase: 'finalTournament', round: 3, label: '決勝' });

  return slots;
}

// ===== ラウンドロビンから試合を生成 =====

function generateLeagueMatches(
  slots: ScheduleSlot[],
  phase: SeasonPhase,
  teamIds: number[],
  playerTeamId: number,
  startId: number,
): SeasonMatch[] {
  const roundRobin = generateRoundRobinSchedule(teamIds);
  const phaseSlots = slots.filter(s => s.phase === phase);
  const matches: SeasonMatch[] = [];

  for (const slot of phaseSlots) {
    const roundMatches = roundRobin.filter(m => m.round === slot.round);
    for (const rm of roundMatches) {
      matches.push({
        id: startId + matches.length,
        phase,
        round: slot.round,
        homeTeamId: rm.homeTeamId,
        awayTeamId: rm.awayTeamId,
        date: slot.date,
        result: null,
        isPlayerMatch: rm.homeTeamId === playerTeamId || rm.awayTeamId === playerTeamId,
      });
    }
  }

  return matches;
}

// ===== カレンダーイベント生成 =====

function generateEvents(slots: ScheduleSlot[], year: number): SeasonDayEvent[] {
  const events: SeasonDayEvent[] = [];

  // 試合日をイベントに
  for (const slot of slots) {
    events.push({
      date: slot.date,
      phase: slot.phase,
      eventType: 'match',
      label: slot.label,
    });
  }

  // 試合日の間を練習日・オフ日で埋める
  const startDate = `${year}-04-01`;
  const endDate = `${year + 1}-03-31`;
  let d = startDate;
  const matchDates = new Set(slots.map(s => s.date));

  while (d <= endDate) {
    if (!matchDates.has(d)) {
      const dow = parseDate(d).getDay();
      // 夏休み判定（7月中旬〜8月）
      const month = parseDate(d).getMonth();
      if (month === 6 || month === 7) {
        events.push({
          date: d,
          phase: 'summerBreak',
          eventType: 'off',
          label: '夏季休暇',
        });
      } else if (dow === 0) {
        // 日曜 = オフ
        events.push({
          date: d,
          phase: getPhaseForDate(d, slots),
          eventType: 'rest',
          label: 'オフ',
        });
      }
      // 平日・土曜で試合じゃない日は表示しない（スキップ対象）
    }
    d = addDays(d, 1);
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

function getPhaseForDate(date: string, slots: ScheduleSlot[]): SeasonPhase {
  // 直近のスロットからフェーズを推定
  for (let i = slots.length - 1; i >= 0; i--) {
    if (slots[i].date <= date) return slots[i].phase;
  }
  return 'springLeague';
}

// ===== SeasonManager =====

export class SeasonManager {
  // ---- 保存・読み込み ----

  static save(state: SeasonState): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  static load(): SeasonState | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SeasonState;
  }

  static clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  }

  // ---- シーズン作成 ----

  static createSeason(playerTeamId: number, year: number = 2026): SeasonState {
    const teams = LEAGUE_TEAMS;
    const teamIds = teams.map(t => t.id);
    const slots = generateSeasonScheduleSlots(year);

    // 春リーグ試合生成
    const springMatches = generateLeagueMatches(slots, 'springLeague', teamIds, playerTeamId, 0);
    // 秋リーグ試合生成
    const fallMatches = generateLeagueMatches(slots, 'fallLeague', teamIds, playerTeamId, springMatches.length);

    const allMatches = [...springMatches, ...fallMatches];
    const events = generateEvents(slots, year);

    // 最初の試合日にmatchIndexを紐付け
    for (const ev of events) {
      if (ev.eventType === 'match') {
        const match = allMatches.find(m => m.date === ev.date && m.isPlayerMatch);
        if (match) {
          ev.matchIndex = match.id;
        }
      }
    }

    const state: SeasonState = {
      year,
      playerTeamId,
      teams,
      currentDate: `${year}-04-01`,
      currentPhase: 'springLeague',
      events,
      matches: allMatches,
      springStandings: teamIds.map(id => ({
        teamId: id, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointDiff: 0,
      })),
      fallStandings: teamIds.map(id => ({
        teamId: id, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointDiff: 0,
      })),
      leagueTournament: null,
      prelimTournament: null,
      finalTournament: null,
      news: [{ date: `${year}-04-01`, text: 'シーズンが開幕しました！' }],
    };

    this.save(state);
    return state;
  }

  // ---- 日付進行 ----

  /** 次のイベント日まで進める */
  static advanceToNextEvent(state: SeasonState): SeasonState {
    const matchDates = [...new Set(state.matches.filter(m => !m.result).map(m => m.date))].sort();
    const nextMatchDate = matchDates.find(d => d > state.currentDate);

    if (!nextMatchDate) {
      return { ...state, currentPhase: 'seasonEnd' };
    }

    const nextMatch = state.matches.find(m => m.date === nextMatchDate && !m.result);
    const phase = nextMatch?.phase ?? state.currentPhase;

    const updated = {
      ...state,
      currentDate: nextMatchDate,
      currentPhase: phase,
    };
    this.save(updated);
    return updated;
  }

  // ---- 試合結果適用 ----

  static applyMatchResult(
    state: SeasonState,
    matchId: number,
    result: SeasonMatchResult,
  ): SeasonState {
    const updated = { ...state, matches: [...state.matches] };
    const idx = updated.matches.findIndex(m => m.id === matchId);
    if (idx === -1) return state;

    updated.matches[idx] = { ...updated.matches[idx], result };

    // 順位表更新
    const match = updated.matches[idx];
    if (match.phase === 'springLeague') {
      updated.springStandings = this.recalcStandings(
        updated.matches.filter(m => m.phase === 'springLeague'),
        updated.teams.map(t => t.id),
      );
    } else if (match.phase === 'fallLeague') {
      updated.fallStandings = this.recalcStandings(
        updated.matches.filter(m => m.phase === 'fallLeague'),
        updated.teams.map(t => t.id),
      );
    }

    // ニュース追加
    const home = updated.teams.find(t => t.id === match.homeTeamId);
    const away = updated.teams.find(t => t.id === match.awayTeamId);
    if (home && away) {
      const winnerName = result.winner === 'home' ? home.name : away.name;
      updated.news = [
        { date: match.date, text: `${home.name} ${result.homeScore}-${result.awayScore} ${away.name}（${winnerName}の勝利）` },
        ...updated.news,
      ].slice(0, 20);
    }

    this.save(updated);
    return updated;
  }

  // ---- 同日のAI試合を全て消化 ----

  static simulateDayMatches(state: SeasonState): SeasonState {
    let updated = { ...state, matches: [...state.matches] };
    const dayMatches = updated.matches.filter(
      m => m.date === updated.currentDate && !m.result && !m.isPlayerMatch,
    );

    for (const match of dayMatches) {
      const result = this.simulateQuickMatch();
      updated = this.applyMatchResult(updated, match.id, result);
    }

    return updated;
  }

  /** 簡易試合シミュレーション */
  private static simulateQuickMatch(): SeasonMatchResult {
    // 60〜100の範囲でスコア生成
    const homeScore = Math.floor(Math.random() * 40) + 60;
    let awayScore = Math.floor(Math.random() * 40) + 60;
    // 同点回避
    if (homeScore === awayScore) awayScore += (Math.random() > 0.5 ? 1 : -1);
    return {
      homeScore,
      awayScore,
      winner: homeScore > awayScore ? 'home' : 'away',
    };
  }

  // ---- 順位表再計算 ----

  private static recalcStandings(matches: SeasonMatch[], teamIds: number[]): LeagueStanding[] {
    const map = new Map<number, LeagueStanding>();
    for (const id of teamIds) {
      map.set(id, { teamId: id, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointDiff: 0 });
    }

    for (const m of matches) {
      if (!m.result) continue;
      const home = map.get(m.homeTeamId)!;
      const away = map.get(m.awayTeamId)!;
      home.pointsFor += m.result.homeScore;
      home.pointsAgainst += m.result.awayScore;
      away.pointsFor += m.result.awayScore;
      away.pointsAgainst += m.result.homeScore;
      if (m.result.winner === 'home') { home.wins++; away.losses++; }
      else { away.wins++; home.losses++; }
    }

    for (const s of map.values()) {
      s.pointDiff = s.pointsFor - s.pointsAgainst;
    }

    return [...map.values()].sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.pointDiff - a.pointDiff;
    });
  }

  // ---- ユーティリティ ----

  static getTeamName(state: SeasonState, teamId: number): string {
    return state.teams.find(t => t.id === teamId)?.name ?? '???';
  }

  static getTeamAbbr(state: SeasonState, teamId: number): string {
    return state.teams.find(t => t.id === teamId)?.abbr ?? '???';
  }

  static getTodayMatches(state: SeasonState): SeasonMatch[] {
    return state.matches.filter(m => m.date === state.currentDate);
  }

  static getPlayerTodayMatch(state: SeasonState): SeasonMatch | undefined {
    return state.matches.find(m => m.date === state.currentDate && m.isPlayerMatch);
  }

  static getNextPlayerMatch(state: SeasonState): SeasonMatch | undefined {
    return state.matches.find(m => m.isPlayerMatch && !m.result && m.date >= state.currentDate);
  }

  /** 現在のリーグ順位表（春 or 秋） */
  static getCurrentStandings(state: SeasonState): LeagueStanding[] {
    if (state.currentPhase === 'fallLeague' || state.currentPhase === 'prelimTournament' ||
        state.currentPhase === 'finalTournament') {
      return state.fallStandings;
    }
    return state.springStandings;
  }

  /** 現在のフェーズの消化済み節数 / 全節数 */
  static getPhaseProgress(state: SeasonState): { current: number; total: number } {
    const phaseMatches = state.matches.filter(m => m.phase === state.currentPhase);
    const rounds = new Set(phaseMatches.map(m => m.round));
    const completedRounds = [...rounds].filter(r =>
      phaseMatches.filter(m => m.round === r).every(m => m.result !== null),
    );
    return { current: completedRounds.length, total: rounds.size };
  }

  /** プレイヤーの戦績 */
  static getPlayerRecord(state: SeasonState): { wins: number; losses: number } {
    const standings = this.getCurrentStandings(state);
    const s = standings.find(s => s.teamId === state.playerTeamId);
    return { wins: s?.wins ?? 0, losses: s?.losses ?? 0 };
  }

  /** プレイヤーの順位 */
  static getPlayerRank(state: SeasonState): number {
    const standings = this.getCurrentStandings(state);
    const idx = standings.findIndex(s => s.teamId === state.playerTeamId);
    return idx + 1;
  }
}
