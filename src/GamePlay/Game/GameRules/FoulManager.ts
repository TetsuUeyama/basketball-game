/**
 * FoulManager — 個人ファウル / チームファウル / ボーナス / ファウルアウト管理
 * NBA ルール基準: 個人 6 ファウル退場、ボーナス 5 回目から、テクニカル別管理。
 */

export const MAX_PERSONAL_FOULS = 6;        // NBA: 6 ファウルで退場
export const TEAM_FOUL_BONUS_THRESHOLD = 5; // NBA: 5 回目からボーナス FT

export type FoulType =
  | 'shooting'        // シュート動作中のディフェンス側ファウル
  | 'non-shooting'    // 通常ディフェンスのコンタクトファウル
  | 'offensive'       // オフェンス側のファウル（チャージング等）
  | 'loose-ball'      // ルーズボール中のファウル
  | 'technical';      // テクニカルファウル（別カウント、退場条件無関係）

export interface FoulRecord {
  playerEntityIdx: number;      // 0-9 の絶対インデックス
  type: FoulType;
  period: string;                // GamePeriod 文字列
  remainingSeconds: number;      // ファウル発生時のゲームクロック残り時間
}

export interface FoulRecordResult {
  /** ファウルアウト発生（このファウルで 6 ファウル到達） */
  foulOut: boolean;
  /** ボーナス状況（チームファウル 5 回目以降） */
  bonus: boolean;
  /** チームのこの期間累積ファウル数 */
  teamFoulsThisPeriod: number;
  /** 累積個人ファウル数 */
  personalFouls: number;
}

export class FoulManager {
  /** 個人ファウル数 (10 プレイヤー分) */
  private personalFouls: number[] = new Array(10).fill(0);
  /** テクニカルファウル数 (個人) */
  private technicalFouls: number[] = new Array(10).fill(0);
  /** ファウルアウト済み */
  private fouledOut: boolean[] = new Array(10).fill(false);
  /** チームファウル数 [team, period]: team=0/1, period=0..9 (Q1..Q4, OT1..OT4 想定) */
  private teamFouls: number[][] = [[], []];
  /** 現在の期間インデックス */
  private currentPeriodIdx: number = 0;
  /** ファウル履歴 (UI 表示用) */
  private history: FoulRecord[] = [];

  constructor() {
    this.teamFouls[0][0] = 0;
    this.teamFouls[1][0] = 0;
  }

  /** ファウル記録。退場・ボーナス情報を返す。 */
  recordFoul(
    playerEntityIdx: number,
    type: FoulType,
    period: string,
    remainingSeconds: number,
  ): FoulRecordResult {
    if (type === 'technical') {
      this.technicalFouls[playerEntityIdx]++;
      this.history.push({ playerEntityIdx, type, period, remainingSeconds });
      return {
        foulOut: false,
        bonus: this.isInBonus(playerEntityIdx < 5 ? 0 : 1),
        teamFoulsThisPeriod: this.getTeamFoulsThisPeriod(playerEntityIdx < 5 ? 0 : 1),
        personalFouls: this.personalFouls[playerEntityIdx],
      };
    }

    this.personalFouls[playerEntityIdx]++;
    const pf = this.personalFouls[playerEntityIdx];
    if (pf >= MAX_PERSONAL_FOULS) {
      this.fouledOut[playerEntityIdx] = true;
    }

    const teamIdx: 0 | 1 = playerEntityIdx < 5 ? 0 : 1;
    const periodArr = this.teamFouls[teamIdx];
    if (periodArr[this.currentPeriodIdx] === undefined) {
      periodArr[this.currentPeriodIdx] = 0;
    }
    periodArr[this.currentPeriodIdx]++;
    const teamFoulsThisPeriod = periodArr[this.currentPeriodIdx];

    this.history.push({ playerEntityIdx, type, period, remainingSeconds });

    return {
      foulOut: this.fouledOut[playerEntityIdx],
      bonus: teamFoulsThisPeriod >= TEAM_FOUL_BONUS_THRESHOLD,
      teamFoulsThisPeriod,
      personalFouls: pf,
    };
  }

  /** 新クォーター/OT 開始時にチームファウルをリセット */
  startNewPeriod(): void {
    this.currentPeriodIdx++;
    this.teamFouls[0][this.currentPeriodIdx] = 0;
    this.teamFouls[1][this.currentPeriodIdx] = 0;
  }

  getPersonalFouls(entityIdx: number): number { return this.personalFouls[entityIdx]; }
  getTechnicalFouls(entityIdx: number): number { return this.technicalFouls[entityIdx]; }
  isFouledOut(entityIdx: number): boolean { return this.fouledOut[entityIdx]; }
  getTeamFoulsThisPeriod(teamIdx: 0 | 1): number {
    return this.teamFouls[teamIdx][this.currentPeriodIdx] ?? 0;
  }
  isInBonus(teamIdx: 0 | 1): boolean {
    return this.getTeamFoulsThisPeriod(teamIdx) >= TEAM_FOUL_BONUS_THRESHOLD;
  }
  getHistory(): FoulRecord[] { return [...this.history]; }
  getPersonalFoulsSnapshot(): number[] { return [...this.personalFouls]; }

  reset(): void {
    this.personalFouls = new Array(10).fill(0);
    this.technicalFouls = new Array(10).fill(0);
    this.fouledOut = new Array(10).fill(false);
    this.teamFouls = [[0], [0]];
    this.currentPeriodIdx = 0;
    this.history = [];
  }
}
