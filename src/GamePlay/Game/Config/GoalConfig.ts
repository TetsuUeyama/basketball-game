// --- Goal positions (NBA: rim center 1.575m from baseline, hoop 10ft = 3.05m) ---
// 計算: SIM_FIELD_Z_HALF (14.325) - backboardDistance (1.2) - rimOffset (0.4) = 12.725
export const GOAL1_RIM_X = 0;
export const GOAL1_RIM_Z = 12.725;    // +Z side
export const GOAL2_RIM_X = 0;
export const GOAL2_RIM_Z = -12.725;   // -Z side
export const GOAL_RIM_Y = 3.05;       // リム高さ（NBA: 10ft = 3.048m）
export const GOAL_RIM_RADIUS = 0.225; // リム内径半径 (m)（NBA: 直径18in = 0.457m → 半径0.229m）

// --- NBA ライン・エリア定義 ---
/** 3ポイントライン: アーク半径（リム中心から） */
export const THREE_POINT_RADIUS = 7.24;       // NBA: 23ft 9in = 7.239m
/** 3ポイントライン: コーナーの直線部 |x| 位置 */
export const THREE_POINT_CORNER_HALF_X = 6.71; // NBA: 22ft = 6.706m
/** コーナー直線部の長さ（ベースラインから垂直方向） */
export const THREE_POINT_CORNER_LENGTH = 4.27; // NBA: 14ft 直線部

/** ペイントエリア（キーエリア / Lane）半幅 */
export const PAINT_HALF_WIDTH = 2.44;          // NBA: 16ft / 2 = 2.44m
/** ペイントエリアの奥行（ベースラインからFTラインまで） */
export const PAINT_DEPTH = 5.79;               // NBA: 19ft = 5.79m

/** フリースローラインのベースラインからの距離 */
export const FREE_THROW_LINE_DIST = 5.79;      // NBA: 19ft = 5.79m

/** ハーフコート Z 座標 */
export const HALFCOURT_Z = 0;

// =========================================================================
// ヘルパー: ショット位置から 2P/3P を判定
// =========================================================================

/**
 * シューターが3ポイントラインの外側にいるか判定
 * @param shooterX シューター X 座標
 * @param shooterZ シューター Z 座標
 * @param goalX 攻撃ゴール X 座標（通常 0）
 * @param goalZ 攻撃ゴール Z 座標（GOAL1_RIM_Z または GOAL2_RIM_Z）
 */
export function isThreePointShot(
  shooterX: number,
  shooterZ: number,
  goalX: number,
  goalZ: number,
): boolean {
  const dx = shooterX - goalX;
  // コーナーゾーン: |x| > 6.71m なら無条件で3P
  if (Math.abs(dx) > THREE_POINT_CORNER_HALF_X) {
    return true;
  }
  // アーク: リムからの直線距離が 7.24m を超える
  const dz = shooterZ - goalZ;
  const dist = Math.sqrt(dx * dx + dz * dz);
  return dist > THREE_POINT_RADIUS;
}

/**
 * ショットの得点値を返す（2 or 3）
 */
export function getShotPointValue(
  shooterX: number,
  shooterZ: number,
  goalX: number,
  goalZ: number,
): 2 | 3 {
  return isThreePointShot(shooterX, shooterZ, goalX, goalZ) ? 3 : 2;
}

/**
 * 指定座標が指定ゴール側のペイントエリア内か判定
 * @param goalSide 1 = +Z側ゴール (GOAL1), -1 = -Z側ゴール (GOAL2)
 */
export function isInPaint(x: number, z: number, goalSide: 1 | -1): boolean {
  if (Math.abs(x) > PAINT_HALF_WIDTH) return false;
  const fieldHalfZ = 14.325; // SIM_FIELD_Z_HALF（循環import回避のためハードコード）
  if (goalSide === 1) {
    // +Z側ゴール: ペイントは z = (Z_HALF - PAINT_DEPTH) 〜 Z_HALF
    return z >= fieldHalfZ - PAINT_DEPTH && z <= fieldHalfZ;
  } else {
    // -Z側ゴール: ペイントは z = -Z_HALF 〜 -(Z_HALF - PAINT_DEPTH)
    return z >= -fieldHalfZ && z <= -(fieldHalfZ - PAINT_DEPTH);
  }
}
