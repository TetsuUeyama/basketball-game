/**
 * ScenePanel — Babylon.js ブートストラップ＋観戦画面。
 *
 * 旧 TrackingSimulationPanel.tsx の Engine/Scene/resize/dispose 骨格を移植
 * （Havok 物理初期化は削除 — 本ゲームはキネマティック制御）。
 * SimState は Sim 層が所有し、ここでは updateSim を毎フレーム呼んで
 * 各 Viz クラスに同期させるだけ。リスタートはシーンごと再構築。
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { Color4, Engine, Scene } from '@babylonjs/core';

import { createSimState } from '@/BaseDefense/Sim/Core/SimState';
import type { SimState } from '@/BaseDefense/Sim/Core/SimState';
import { updateSim } from '@/BaseDefense/Sim/Core/SimLoop';
import { createDefaultSetup } from '@/BaseDefense/Sim/Config/MatchConfig';
import type { SimEvent } from '@/BaseDefense/Sim/Core/SimEvents';

import { createOverheadCamera } from './SceneCamera';
import { createLights } from './SceneLight';
import { buildMapMeshes } from './MapMeshBuilder';
import { AgentMeshes } from './AgentMeshes';
import { VisionConeViz } from './VisionConeViz';
import { SoundRippleViz } from './SoundRippleViz';
import { HudOverlay } from './HudOverlay';
import type { HudData } from './HudOverlay';

/** 1フレームの最大シミュレーション進行（タブ復帰時の暴走防止） */
const MAX_DT = 0.05;

export function ScenePanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [resetKey, setResetKey] = useState(0);
  const [hud, setHud] = useState<HudData>({
    time: 0,
    timeLimit: 0,
    outcome: null,
    soldiers: [],
    recentEvents: [],
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // --- Babylon.js Engine + Scene ---
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.07, 0.08, 0.1, 1);

    // --- シミュレーション状態 ---
    // シードはリスタートごとに変える（Sim内の乱数はシード付きRNGのみ使用）
    const seed = (Date.now() % 2147483647) + resetKey;
    const state: SimState = createSimState(createDefaultSetup(seed));

    // --- カメラ・ライト・マップ・エンティティ表示 ---
    createOverheadCamera(scene, canvas, state.map.width, state.map.depth);
    createLights(scene);
    buildMapMeshes(scene, state.map);
    const agents = new AgentMeshes(scene, state);
    const cones = new VisionConeViz(scene, state);
    const ripples = new SoundRippleViz(scene);

    // --- 毎フレーム: Sim更新 → 表示同期 ---
    scene.onBeforeRenderObservable.add(() => {
      const dt = Math.min(engine.getDeltaTime() / 1000, MAX_DT);
      updateSim(state, dt);
      agents.sync(state);
      cones.sync(state);
      ripples.sync(state);
    });

    engine.runRenderLoop(() => {
      scene.render();
    });

    // --- Resize ---
    const handleResize = () => engine.resize();
    window.addEventListener('resize', handleResize);

    // --- HUD 更新（4Hz） ---
    const hudInterval = setInterval(() => {
      setHud({
        time: state.time,
        timeLimit: state.timeLimitSec,
        outcome: state.outcome,
        soldiers: state.soldiers.map((s) => ({
          id: s.id,
          state: s.fsm.state,
          suspicion: s.suspicion,
        })),
        recentEvents: state.events
          .filter((ev) => ev.kind !== 'fsm_change' && ev.kind !== 'sighting_lost')
          .slice(-6)
          .map(formatEvent),
      });
    }, 250);

    return () => {
      clearInterval(hudInterval);
      window.removeEventListener('resize', handleResize);
      scene.dispose();
      engine.dispose();
    };
  }, [resetKey]);

  return (
    <div className="relative w-full h-screen bg-black">
      <canvas ref={canvasRef} className="w-full h-full outline-none" />
      <HudOverlay data={hud} onReset={() => setResetKey((k) => k + 1)} />
    </div>
  );
}

function formatEvent(ev: SimEvent): string {
  const t = `[${Math.floor(ev.time)}s]`;
  switch (ev.kind) {
    case 'sighting':
      return `${t} 兵士${ev.actorId} が侵入者を視認 (${ev.detail})`;
    case 'sighting_lost':
      return `${t} 兵士${ev.actorId} が侵入者を見失った`;
    case 'sound_heard':
      return `${t} 兵士${ev.actorId} が物音を聴取 (${ev.detail})`;
    case 'camera_detect':
      return `${t} カメラ${ev.actorId} が侵入者を検知`;
    case 'radio':
      return `${t} 兵士${ev.actorId} が無線で目撃情報を受信`;
    case 'shot':
      return `${t} 兵士${ev.actorId} が発砲 (${ev.detail === 'hit' ? '命中' : '外れ'})`;
    case 'kill':
      return `${t} 兵士${ev.actorId} が侵入者を排除！`;
    case 'objective_taken':
      return `${t} 侵入者が機密を奪取！`;
    case 'exfil':
      return `${t} 侵入者が離脱${ev.detail === 'with_intel' ? '（機密持ち出し）' : '（手ぶら）'}`;
    case 'match_end':
      return `${t} 試合終了 (${ev.detail})`;
    default:
      return `${t} ${ev.kind}`;
  }
}
