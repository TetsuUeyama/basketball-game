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
import { dist2d } from '../src/BaseDefense/Sim/Core/MathUtils';
import {
  scenarioCrossCone,
  scenarioBehindWall,
  scenarioHearing,
  scenarioCombat,
  scenarioRadioConverge,
} from './scenarios';

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
console.log('■ シナリオ5: 交戦 — 正面から来る侵入者を発見→射撃。全試合が決着する');
{
  let shots = 0;
  let kills = 0;
  let escapes = 0;
  let timeouts = 0;
  for (const seed of SEEDS) {
    const state = createSimState(scenarioCombat(seed));
    runFor(state, 90);
    shots += state.events.filter((e) => e.kind === 'shot').length;
    kills += state.events.filter((e) => e.kind === 'kill').length;
    escapes += state.events.filter((e) => e.kind === 'exfil').length;
    if (!state.outcome || state.outcome.reason === 'timeout') timeouts++;
  }
  check('発砲が発生', shots > 0, `${shots} 発`);
  check('全試合が決着（排除 or 逃走完了）',
    kills + escapes === SEEDS.length && timeouts === 0,
    `排除${kills} / 逃走${escapes} / タイムアウト${timeouts}`);
}

// =========================================================================
console.log('■ シナリオ6: 無線収束 — カメラ検知の無線を受けた兵士BがSEARCHで現地へ');
{
  let radioOk = 0;
  let convergeOk = 0;
  let searchOk = 0;
  for (const seed of SEEDS) {
    const state = createSimState(scenarioRadioConverge(seed));
    const soldierB = state.soldiers[0];
    // 目撃位置（無線で報告された座標）と兵士Bの最接近距離を追跡
    let reported: { x: number; z: number } | null = null;
    let minDist = Infinity;
    const DT2 = 1 / 60;
    for (let k = 0; k < 60 * 60; k++) {
      updateSim(state, DT2);
      if (!reported) {
        const radioEv = state.events.find(
          (e) => e.kind === 'radio' && e.actorId === soldierB.id,
        );
        if (radioEv) reported = { x: radioEv.x, z: radioEv.z };
      } else {
        minDist = Math.min(minDist, dist2d(soldierB.x, soldierB.z, reported.x, reported.z));
      }
      if (state.outcome) break;
    }
    if (reported) radioOk++;
    if (minDist <= 6) convergeOk++;
    if (state.events.some(
      (e) => e.kind === 'fsm_change' && e.actorId === soldierB.id && e.detail?.endsWith('->SEARCH'),
    )) searchOk++;
  }
  check('Bが無線を受信', radioOk === SEEDS.length, `${radioOk}/${SEEDS.length}`);
  check('BがSEARCHへ遷移', searchOk === SEEDS.length, `${searchOk}/${SEEDS.length}`);
  check('Bが目撃位置6m以内へ収束', convergeOk === SEEDS.length, `${convergeOk}/${SEEDS.length}`);
}

// =========================================================================
console.log('■ シナリオ7: FSMフラッピングなし — デフォルト試合10シード');
{
  // フラップ = A→B→A の1秒未満往復のうち、2遷移目がデエスカレーション
  //（警戒度が下がる方向）のもの。視認による即時エスカレーション（例: SEARCH→COMBAT
  // の再交戦）は意図した挙動なので数えない。
  const RANK: Record<string, number> = { PATROL: 0, SUSPICIOUS: 1, SEARCH: 2, COMBAT: 3 };
  let flaps = 0;
  for (let seed = 200; seed < 210; seed++) {
    const state = createSimState(createDefaultSetup(seed));
    runFor(state, state.timeLimitSec + 5);
    const bySoldier = new Map<number, { time: number; detail: string }[]>();
    for (const e of state.events) {
      if (e.kind !== 'fsm_change' || e.actorId === undefined || !e.detail?.includes('->')) continue;
      if (e.detail.startsWith('intruder')) continue;
      if (!bySoldier.has(e.actorId)) bySoldier.set(e.actorId, []);
      bySoldier.get(e.actorId)!.push({ time: e.time, detail: e.detail });
    }
    for (const changes of bySoldier.values()) {
      for (let k = 1; k < changes.length; k++) {
        const [prevFrom, prevTo] = changes[k - 1].detail.split('->');
        const [curFrom, curTo] = changes[k].detail.split('->');
        const isReturn = prevFrom === curTo && prevTo === curFrom;
        const isDeescalation = RANK[curTo] < RANK[curFrom];
        if (isReturn && isDeescalation && changes[k].time - changes[k - 1].time < 1.0) {
          flaps++;
        }
      }
    }
  }
  check('フラッピング', flaps === 0, `1秒未満のデエスカレーション往復 ${flaps} 件（期待0）`);
}

// =========================================================================
console.log('■ 参考統計: デフォルト試合 20 シード（FSM+交戦+隠密AI有効）');
{
  const outcomes: Record<string, number> = {};
  let totalSightings = 0;
  let totalHeard = 0;
  let totalCamera = 0;
  let totalShots = 0;
  let totalKills = 0;
  let defenderWins = 0;
  let timeouts = 0;
  const N = 20;
  for (let seed = 100; seed < 100 + N; seed++) {
    const state = createSimState(createDefaultSetup(seed));
    runFor(state, state.timeLimitSec + 5);
    const key = state.outcome ? `${state.outcome.winner}:${state.outcome.reason}` : 'none';
    outcomes[key] = (outcomes[key] ?? 0) + 1;
    if (state.outcome?.winner === 'defender') defenderWins++;
    if (!state.outcome || state.outcome.reason === 'timeout') timeouts++;
    totalSightings += state.events.filter((e) => e.kind === 'sighting').length;
    totalHeard += state.events.filter((e) => e.kind === 'sound_heard').length;
    totalCamera += state.events.filter((e) => e.kind === 'camera_detect').length;
    totalShots += state.events.filter((e) => e.kind === 'shot').length;
    totalKills += state.events.filter((e) => e.kind === 'kill').length;
  }
  console.log(`  勝敗分布: ${JSON.stringify(outcomes)}`);
  console.log(
    `  イベント/試合: 視認${(totalSightings / N).toFixed(1)} ` +
    `聴取${(totalHeard / N).toFixed(1)} カメラ${(totalCamera / N).toFixed(1)} ` +
    `発砲${(totalShots / N).toFixed(1)} 排除${(totalKills / N).toFixed(1)}`,
  );
  console.log(`  防衛側勝率: ${((defenderWins / N) * 100).toFixed(0)}%`);
  check('タイムアウトなし（全試合が能動的に決着）', timeouts === 0, `${timeouts}/${N} 件`);
  check(
    '防衛側勝率が退化していない (5〜95%)',
    defenderWins / N >= 0.05 && defenderWins / N <= 0.95,
    `${defenderWins}/${N}`,
  );
}

// =========================================================================
console.log('');
if (failures > 0) {
  console.log(`✗ ${failures} 件の検証が FAIL`);
  process.exit(1);
} else {
  console.log('✓ 全検証 PASS');
}
