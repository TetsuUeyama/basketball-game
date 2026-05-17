/**
 * BoxScore — 個人スタッツ集計 (10 プレイヤー分)
 * NBA 標準ボックススコア: PTS / REB (OFF/DEF) / AST / STL / BLK / TO / PF / FG / 3P / FT
 */

export interface PlayerStats {
  points: number;
  rebounds: number;          // total = offensive + defensive
  offensiveRebounds: number;
  defensiveRebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  personalFouls: number;
  fgMade: number;
  fgAttempted: number;
  threePointMade: number;
  threePointAttempted: number;
  ftMade: number;
  ftAttempted: number;
}

function emptyStats(): PlayerStats {
  return {
    points: 0,
    rebounds: 0,
    offensiveRebounds: 0,
    defensiveRebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    personalFouls: 0,
    fgMade: 0,
    fgAttempted: 0,
    threePointMade: 0,
    threePointAttempted: 0,
    ftMade: 0,
    ftAttempted: 0,
  };
}

export class BoxScore {
  private stats: PlayerStats[];

  constructor(playerCount: number = 10) {
    this.stats = Array.from({ length: playerCount }, emptyStats);
  }

  addFieldGoalAttempt(entityIdx: number, made: boolean, isThree: boolean): void {
    const s = this.stats[entityIdx];
    if (!s) return;
    s.fgAttempted++;
    if (isThree) s.threePointAttempted++;
    if (made) {
      s.fgMade++;
      const value = isThree ? 3 : 2;
      s.points += value;
      if (isThree) s.threePointMade++;
    }
  }

  addFreeThrowAttempts(entityIdx: number, made: number, attempts: number): void {
    const s = this.stats[entityIdx];
    if (!s) return;
    s.ftAttempted += attempts;
    s.ftMade += made;
    s.points += made;
  }

  addRebound(entityIdx: number, offensive: boolean): void {
    const s = this.stats[entityIdx];
    if (!s) return;
    s.rebounds++;
    if (offensive) s.offensiveRebounds++;
    else s.defensiveRebounds++;
  }

  addAssist(entityIdx: number): void {
    const s = this.stats[entityIdx];
    if (s) s.assists++;
  }

  addSteal(entityIdx: number): void {
    const s = this.stats[entityIdx];
    if (s) s.steals++;
  }

  addBlock(entityIdx: number): void {
    const s = this.stats[entityIdx];
    if (s) s.blocks++;
  }

  addTurnover(entityIdx: number): void {
    const s = this.stats[entityIdx];
    if (s) s.turnovers++;
  }

  addPersonalFoul(entityIdx: number): void {
    const s = this.stats[entityIdx];
    if (s) s.personalFouls++;
  }

  getStats(entityIdx: number): PlayerStats | undefined {
    return this.stats[entityIdx];
  }

  getAllStats(): PlayerStats[] {
    return this.stats.map(s => ({ ...s }));
  }

  /** チーム合計を計算 (0-4=Team A, 5-9=Team B) */
  getTeamTotals(team: 0 | 1): PlayerStats {
    const start = team * 5;
    const total = emptyStats();
    for (let i = start; i < start + 5; i++) {
      const s = this.stats[i];
      total.points += s.points;
      total.rebounds += s.rebounds;
      total.offensiveRebounds += s.offensiveRebounds;
      total.defensiveRebounds += s.defensiveRebounds;
      total.assists += s.assists;
      total.steals += s.steals;
      total.blocks += s.blocks;
      total.turnovers += s.turnovers;
      total.personalFouls += s.personalFouls;
      total.fgMade += s.fgMade;
      total.fgAttempted += s.fgAttempted;
      total.threePointMade += s.threePointMade;
      total.threePointAttempted += s.threePointAttempted;
      total.ftMade += s.ftMade;
      total.ftAttempted += s.ftAttempted;
    }
    return total;
  }

  reset(): void {
    for (let i = 0; i < this.stats.length; i++) this.stats[i] = emptyStats();
  }
}
