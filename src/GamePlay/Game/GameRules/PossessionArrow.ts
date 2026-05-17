/**
 * PossessionArrow — オルタネイト・ポゼッション・アロー管理
 *
 * NBA ルール:
 *  - 試合開始時のジャンプボールの敗者側にアローを向ける
 *  - ジャンプボール状況（held ball）が発生したらアロー方向のチームにボール、その後アロー反転
 *  - クォーター開始時にもアロー方向のチームから開始（次クォーター以降）
 */

export class PossessionArrow {
  /** 現在アローが指しているチーム (次のジャンプボール状況でこのチームがボールを取る) */
  private arrowTeam: 0 | 1 = 0;
  /** ジャンプボールで取った最初のチーム（試合開始のティップオフ結果） */
  private tipOffWinner: 0 | 1 = 0;

  /** 試合開始のティップオフ結果を記録（敗者側にアローを向ける） */
  setTipOffResult(winnerTeam: 0 | 1): void {
    this.tipOffWinner = winnerTeam;
    this.arrowTeam = winnerTeam === 0 ? 1 : 0; // 敗者にアロー
  }

  /** ジャンプボール状況（held ball）でアロー方向のチームにボールを与え、アロー反転 */
  consume(): 0 | 1 {
    const team = this.arrowTeam;
    this.arrowTeam = team === 0 ? 1 : 0;
    return team;
  }

  /** 現在のアロー方向 */
  getArrow(): 0 | 1 { return this.arrowTeam; }

  /** ティップオフ勝者 */
  getTipOffWinner(): 0 | 1 { return this.tipOffWinner; }

  reset(): void {
    this.arrowTeam = 0;
    this.tipOffWinner = 0;
  }
}
