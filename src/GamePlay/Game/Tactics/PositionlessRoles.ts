/**
 * PositionlessRoles — 現代ポジションレス対応
 *
 * リサーチ根拠:
 *  - 現代 NBA: Combo Guard, Point Forward, Stretch 4, Small Ball 5
 *  - 能力値から動的にロールを推論
 *
 * 既存の SimPosition ('PG' | 'SG' | 'SF' | 'PF' | 'C') を保持しつつ、
 * モダンロール識別子を追加。
 */

import type { PlayerStats } from "@/GamePlay/Data/Types/PlayerData";
import type { SimMover } from "../Types/TrackingSimTypes";

/** 現代ポジションレス ロール識別子 */
export type ModernRole =
  | 'COMBO_GUARD'      // PG + SG: スコア+playmaking 両方
  | 'POINT_FORWARD'    // SF + PG: フォワードがゲームメイク
  | 'STRETCH_4'        // PF + 3P: 外でも撃てる PF
  | 'SMALL_BALL_5'     // 機動力重視 C
  | 'TRADITIONAL_PG'
  | 'TRADITIONAL_SG'
  | 'TRADITIONAL_SF'
  | 'TRADITIONAL_PF'
  | 'TRADITIONAL_C';

export interface ModernRoleProfile {
  role: ModernRole;
  /** スコアリング能力 (0..100) */
  scoring: number;
  /** プレイメイキング能力 */
  playmaking: number;
  /** リム保護能力 */
  rimProtection: number;
  /** 3P 能力 */
  threePoint: number;
  /** 機動力 */
  mobility: number;
}

// =========================================================================
// 能力値からモダンロールを推論
// =========================================================================

/**
 * PlayerStats と身長から最適なモダンロールを推論。
 * @param stats 選手能力値 (NBA 0-99 想定だが範囲は柔軟)
 * @param heightCm 身長 (cm)
 */
export function inferModernRole(stats: PlayerStats, heightCm: number): ModernRoleProfile {
  const threeP = stats['3paccuracy'];
  const playmaking = stats.passaccuracy;
  const scoring = stats.offense;
  const speed = stats.speed;
  const dunk = stats.dunk;

  // 身長で大まかな従来ポジションを決定
  if (heightCm < 185) {
    // ガード体型
    if (scoring >= 75 && playmaking >= 70) {
      return { role: 'COMBO_GUARD', scoring, playmaking, rimProtection: 0, threePoint: threeP, mobility: speed };
    }
    return { role: 'TRADITIONAL_PG', scoring, playmaking, rimProtection: 0, threePoint: threeP, mobility: speed };
  }
  if (heightCm < 195) {
    // SG / SF 体型
    if (playmaking >= 80 && scoring >= 70) {
      return { role: 'POINT_FORWARD', scoring, playmaking, rimProtection: 10, threePoint: threeP, mobility: speed };
    }
    return { role: 'TRADITIONAL_SG', scoring, playmaking, rimProtection: 5, threePoint: threeP, mobility: speed };
  }
  if (heightCm < 208) {
    // SF / PF 体型
    if (threeP >= 70) {
      return { role: 'STRETCH_4', scoring, playmaking, rimProtection: 20, threePoint: threeP, mobility: speed };
    }
    return { role: 'TRADITIONAL_PF', scoring, playmaking, rimProtection: 25, threePoint: threeP, mobility: speed };
  }
  // 208cm+ = C 体型
  if (speed >= 75 && threeP >= 50) {
    return { role: 'SMALL_BALL_5', scoring, playmaking, rimProtection: 50, threePoint: threeP, mobility: speed };
  }
  return { role: 'TRADITIONAL_C', scoring, playmaking, rimProtection: 80, threePoint: threeP, mobility: speed };
}

// =========================================================================
// 簡易推論 (SimMover の身長のみから、能力値なしで)
// =========================================================================

/**
 * SimMover の身長のみから "近似" モダンロールを推論。
 * 能力値が無い場合 (Phase H.4.4 配線前) のフォールバック。
 */
export function inferRoleFromHeight(mover: SimMover): ModernRole {
  if (mover.height < 185) return 'TRADITIONAL_PG';
  if (mover.height < 195) return 'TRADITIONAL_SG';
  if (mover.height < 205) return 'TRADITIONAL_SF';
  if (mover.height < 213) return 'TRADITIONAL_PF';
  return 'TRADITIONAL_C';
}

// =========================================================================
// モダンロールの戦術的傾向
// =========================================================================

/**
 * モダンロールごとに「シュート/パス/ドライブ/リバウンド」傾向を返す。
 * ActionScorer の重み調整に使う。
 */
export interface RoleTendencies {
  shoot: number;       // 0..1
  pass: number;
  drive: number;
  rebound: number;
  rimProtect: number;
}

export const ROLE_TENDENCIES: Record<ModernRole, RoleTendencies> = {
  COMBO_GUARD:     { shoot: 0.7, pass: 0.7, drive: 0.7, rebound: 0.2, rimProtect: 0.1 },
  POINT_FORWARD:   { shoot: 0.6, pass: 0.85, drive: 0.7, rebound: 0.5, rimProtect: 0.3 },
  STRETCH_4:       { shoot: 0.75, pass: 0.5, drive: 0.5, rebound: 0.6, rimProtect: 0.5 },
  SMALL_BALL_5:    { shoot: 0.55, pass: 0.45, drive: 0.5, rebound: 0.75, rimProtect: 0.7 },
  TRADITIONAL_PG:  { shoot: 0.55, pass: 0.9, drive: 0.65, rebound: 0.15, rimProtect: 0.05 },
  TRADITIONAL_SG:  { shoot: 0.8, pass: 0.5, drive: 0.6, rebound: 0.2, rimProtect: 0.1 },
  TRADITIONAL_SF:  { shoot: 0.65, pass: 0.55, drive: 0.7, rebound: 0.45, rimProtect: 0.3 },
  TRADITIONAL_PF:  { shoot: 0.4, pass: 0.4, drive: 0.55, rebound: 0.75, rimProtect: 0.6 },
  TRADITIONAL_C:   { shoot: 0.3, pass: 0.35, drive: 0.5, rebound: 0.85, rimProtect: 0.9 },
};
