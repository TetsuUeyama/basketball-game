/**
 * run-sim — ヘッドレス統計検証ハーネス。
 *
 * 実行: yarn sim  (= tsx harness/run-sim.ts)
 *
 * 検証方針（soccer-sim の教訓）: イベント発火数だけでなく、
 * 発生座標・時刻という「幾何」も必ず検証する。
 * 全シナリオ PASS で exit 0、1つでも FAIL なら exit 1。
 */

import { createSimState } from '../src/BaseDefense/Sim/Core/SimState';
import type { SimState } from '../src/BaseDefense/Sim/Core/SimState';
import { updateSim } from '../src/BaseDefense/Sim/Core/SimLoop';
import { createDefaultSetup } from '../src/BaseDefense/Sim/Config/MatchConfig';
import { scenarioCrossCone, scenarioBehindWall, scenarioHearing } from './scenarios';

const DT = 1 / 60;
let failures = 0;

function runFor(state: SimState, seconds: number): void {
  const steps = Math.round(seconds / DT);
  for (let k = 0; k < steps; k++) {
    updateSim(state, DT);
    if (state.outcome) return;
  }
}

function check(label: string, ok: boolean, detail: string): void {
  const mark = ok ? 'PASS' : 'FAIL';
  if (!ok) failures++;
  console.log(`  [${mark}] ${label} — ${detail}`);
}

const SEEDS = [1, 2, 3, 4, 5, 11, 22, 33, 44, 55];

// =========================================================================
console.log('■ シナリオ1: コーン横断 → 視認率100%（座標検証つき）');
{
  let detected = 0;
  let geomOk = true;
  let firstDetail = '';
  for (const seed of SEEDS) {
    const state = createSimState(scenarioCrossCone(seed));
    runFor(state, 40);
    const sightings = state.events.filter((e) => e.kind === 'sighting');
    if (sightings.length > 0) {
      detected++;
      const s0 = sightings[0];
      // 幾何: 最初の視認は横断ライン z≈8 上、かつ視界範囲内 |x| <= 22 のはず
      const gOk = Math.abs(s0.z - 8) < 1.0 && Math.abs(s0.x) <= 22;
      if (!gOk) geomOk = false;
      if (!firstDetail) {
        firstDetail = `初視認例: t=${s0.time.toFixed(1)}s (${s0.x.toFixed(1)}, ${s0.z.toFixed(1)}) ${s0.detail}`;
      }
    }
  }
  check('視認率', detected === SEEDS.length, `${detected}/${SEEDS.length} シード`);
  check('視認座標', geomOk, firstDetail || '視認なし');
}

// =========================================================================
console.log('■ シナリオ2: 壁裏の横断 → 視認0%');
{
  let sightingsTotal = 0;
  for (const seed of SEEDS) {
    const state = createSimState(scenarioBehindWall(seed));
    runFor(state, 40);
    sightingsTotal += state.events.filter(
      (e) => e.kind === 'sighting' || e.kind === 'camera_detect',
    ).length;
  }
  check('遮蔽', sightingsTotal === 0, `視認イベント合計 ${sightingsTotal} 件（期待0）`);
}

// =========================================================================
console.log('■ シナリオ3: 聴覚 — run=聴取あり / walk=なし(半径外) / sneak=なし(無音)');
{
  const results: Record<string, number> = {};
  for (const mode of ['run', 'walk', 'sneak'] as const) {
    let heard = 0;
    for (const seed of SEEDS) {
      const state = createSimState(scenarioHearing(seed, mode));
      runFor(state, 30);
      heard += state.events.filter((e) => e.kind === 'sound_heard').length;
    }
    results[mode] = heard;
  }
  check('run音の聴取', results.run > 0, `${results.run} 件（期待>0）`);
  check('walk音は半径外', results.walk === 0, `${results.walk} 件（期待0: 距離10m > 半径5m）`);
  check('sneakは無音', results.sneak === 0, `${results.sneak} 件（期待0）`);
}

// =========================================================================
console.log('■ シナリオ4: 決定論 — 同一シード2回実行で全エンティティ座標が一致');
{
  const posDump = (state: SimState) =>
    JSON.stringify([
      ...state.soldiers.map((s) => [s.x, s.z, s.facing]),
      ...state.intruders.map((i) => [i.x, i.z, i.facing]),
    ]);
  const a = createSimState(createDefaultSetup(777));
  const b = createSimState(createDefaultSetup(777));
  let same = true;
  for (let sec = 0; sec < 60; sec += 5) {
    runFor(a, 5);
    runFor(b, 5);
    if (posDump(a) !== posDump(b)) {
      same = false;
      break;
    }
  }
  check('決定論', same, same ? '60秒間 5秒毎の座標が完全一致' : '座標が分岐した');
}

// =========================================================================
console.log('■ 参考統計: デフォルト試合 20 シード（現状はFSM未実装 = 兵士は反応しない）');
{
  const outcomes: Record<string, number> = {};
  let totalSightings = 0;
  let totalHeard = 0;
  let totalCamera = 0;
  let firstDetectTimes: number[] = [];
  for (let seed = 100; seed < 120; seed++) {
    const state = createSimState(createDefaultSetup(seed));
    runFor(state, state.timeLimitSec + 5);
    const key = state.outcome ? `${state.outcome.winner}:${state.outcome.reason}` : 'none';
    outcomes[key] = (outcomes[key] ?? 0) + 1;
    totalSightings += state.events.filter((e) => e.kind === 'sighting').length;
    totalHeard += state.events.filter((e) => e.kind === 'sound_heard').length;
    totalCamera += state.events.filter((e) => e.kind === 'camera_detect').length;
    const first = state.events.find(
      (e) => e.kind === 'sighting' || e.kind === 'sound_heard' || e.kind === 'camera_detect',
    );
    if (first) firstDetectTimes.push(first.time);
  }
  console.log(`  勝敗分布: ${JSON.stringify(outcomes)}`);
  console.log(
    `  検知イベント/試合: 視認${(totalSightings / 20).toFixed(1)} ` +
    `聴取${(totalHeard / 20).toFixed(1)} カメラ${(totalCamera / 20).toFixed(1)}`,
  );
  if (firstDetectTimes.length > 0) {
    const avg = firstDetectTimes.reduce((a, b) => a + b, 0) / firstDetectTimes.length;
    console.log(
      `  初検知: ${firstDetectTimes.length}/20 試合で発生, 平均 ${avg.toFixed(1)}秒`,
    );
  } else {
    console.log('  初検知: 0/20 試合 — 要確認（侵入者が完全に検知網を回避している）');
  }
}

// =========================================================================
console.log('');
if (failures > 0) {
  console.log(`✗ ${failures} 件の検証が FAIL`);
  process.exit(1);
} else {
  console.log('✓ 全検証 PASS');
}
