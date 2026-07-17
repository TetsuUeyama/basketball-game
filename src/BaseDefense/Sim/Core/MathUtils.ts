/**
 * MathUtils — 角度・距離の規約を一元定義する。
 *
 * 【角度規約（このプロジェクト唯一の正）】
 *  - forward = +Z（グローバル3D座標ルール準拠）
 *  - 角度 a は +Z からの回転角。方向ベクトルは (dirX, dirZ) = (sin a, cos a)
 *  - 方向→角度は必ず angleOf(dx, dz) = atan2(dx, dz) を使う
 *  - atan2(dz, dx)（+X基準）は禁止。旧バスケコードからの移植時は全て置換済み
 */

/** 方向ベクトル (dx, dz) の角度（+Z基準、rad） */
export function angleOf(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

/** 角度 a の方向ベクトル X 成分 */
export function dirX(a: number): number {
  return Math.sin(a);
}

/** 角度 a の方向ベクトル Z 成分 */
export function dirZ(a: number): number {
  return Math.cos(a);
}

/** 度 → ラジアン（FOV半角などの設定値表記用） */
export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** 角度差を [-PI, PI] に正規化して返す（b - a） */
export function normAngleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function dist2d(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

export function dist2dSq(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
