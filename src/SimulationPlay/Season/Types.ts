/**
 * シーズンシミュレーションの型定義
 * 年間スケジュール: 春リーグ → リーグ内T → 秋リーグ → 予選T → 決勝T
 */

import type { LeagueTeam } from '@/SimulationPlay/Management/League/Types';

// ===== シーズンフェーズ =====

export type SeasonPhase =
  | 'springLeague'       // 春リーグ戦（7節）
  | 'leagueTournament'   // リーグ内トーナメント
  | 'summerBreak'        // 夏休み
  | 'fallLeague'         // 秋リーグ戦（7節）
  | 'prelimTournament'   // 全体予選トーナメント
  | 'finalTournament'    // 全体決勝トーナメント
  | 'seasonEnd';         // シーズン終了

export const PHASE_LABELS: Record<SeasonPhase, string> = {
  springLeague: '春リーグ戦',
  leagueTournament: 'リーグ内トーナメント',
  summerBreak: '夏休み',
  fallLeague: '秋リーグ戦',
  prelimTournament: '全体予選トーナメント',
  finalTournament: '全体決勝トーナメント',
  seasonEnd: 'シーズン終了',
};

// ===== カレンダー日イベント =====

export type DayEventType = 'match' | 'training' | 'rest' | 'off';

export interface SeasonDayEvent {
  date: string;              // 'YYYY-MM-DD'
  phase: SeasonPhase;
  eventType: DayEventType;
  label: string;             // 例: '春リーグ第3節', '練習'
  matchIndex?: number;       // この日の試合インデックス（matches配列内）
}

// ===== 試合 =====

export interface SeasonMatch {
  id: number;
  phase: SeasonPhase;
  round: number;             // 節番号 or ラウンド番号
  homeTeamId: number;
  awayTeamId: number;
  date: string;              // 'YYYY-MM-DD'
  result: SeasonMatchResult | null;
  isPlayerMatch: boolean;    // プレイヤーのチームの試合か
}

export interface SeasonMatchResult {
  homeScore: number;
  awayScore: number;
  winner: 'home' | 'away';
}

// ===== トーナメントブラケット =====

export interface TournamentSlot {
  teamId: number | null;     // null = 未定
  seed: number;
}

export interface TournamentRound {
  roundIndex: number;
  label: string;             // '準決勝', '決勝' etc
  matches: SeasonMatch[];
}

export interface TournamentState {
  phase: SeasonPhase;
  rounds: TournamentRound[];
  bracket: TournamentSlot[];
}

// ===== リーグ成績 =====

export interface LeagueStanding {
  teamId: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
}

// ===== シーズン全体の状態 =====

export interface SeasonState {
  year: number;              // 開始年度（2026年度 = 2026）
  playerTeamId: number;
  teams: LeagueTeam[];

  // 現在の進行位置
  currentDate: string;       // 'YYYY-MM-DD' 現在の日付
  currentPhase: SeasonPhase;

  // カレンダー
  events: SeasonDayEvent[];

  // 試合一覧
  matches: SeasonMatch[];

  // 各リーグの順位表
  springStandings: LeagueStanding[];
  fallStandings: LeagueStanding[];

  // トーナメント状態
  leagueTournament: TournamentState | null;
  prelimTournament: TournamentState | null;
  finalTournament: TournamentState | null;

  // ニュース
  news: SeasonNews[];
}

// ===== ニュース =====

export interface SeasonNews {
  date: string;
  text: string;
}

// ===== UI用の画面切り替え =====

export type SeasonView = 'home' | 'match' | 'schedule' | 'standings' | 'roster' | 'result';
