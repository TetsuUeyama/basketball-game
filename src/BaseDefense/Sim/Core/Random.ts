/**
 * Random — シード付き乱数（mulberry32）。
 *
 * Sim コアで Math.random の直呼びは禁止。必ず SimState.rng を注入して使う。
 * 同一シード → 同一系列が保証され、ヘッドレスハーネスの再現性検証に使う。
 */

export type Rng = () => number;

/** mulberry32: 32bit シードの高速PRNG。[0, 1) を返す */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [min, max) の一様乱数 */
export function randRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}
