/**
 * SoundRippleViz — 音イベントの波紋表示。
 *
 * SimState.sounds に新しい音が現れたらリング（トーラス）を生成し、
 * sim時間ベースで基本半径まで拡大しながらフェードアウト → 破棄。
 * 走行音は歩行音より大きな波紋になる（= radius がそのまま伝わる）。
 */

import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
} from '@babylonjs/core';

import type { SimState } from '@/BaseDefense/Sim/Core/SimState';

/** 波紋の表示時間（秒、sim時間） */
const RIPPLE_DURATION = 0.6;

interface Ripple {
  mesh: Mesh;
  mat: StandardMaterial;
  bornAt: number;
  radius: number;
}

export class SoundRippleViz {
  private scene: Scene;
  private ripples: Ripple[] = [];
  private lastSeenSoundId = 0;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  sync(state: SimState): void {
    // 新しい音 → リング生成
    for (const snd of state.sounds) {
      if (snd.id <= this.lastSeenSoundId) continue;
      this.lastSeenSoundId = Math.max(this.lastSeenSoundId, snd.id);
      if (snd.radius <= 0) continue;

      const mesh = MeshBuilder.CreateTorus(
        `ripple_${snd.id}`,
        { diameter: 1, thickness: 0.07, tessellation: 40 },
        this.scene,
      );
      mesh.position.set(snd.x, 0.05, snd.z);
      mesh.isPickable = false;
      const mat = new StandardMaterial(`rippleMat_${snd.id}`, this.scene);
      const isLoud = snd.kind === 'run' || snd.kind === 'gunshot';
      mat.emissiveColor = Color3.FromHexString(isLoud ? '#f87171' : '#e2e8f0');
      mat.disableLighting = true;
      mat.alpha = 0.55;
      mesh.material = mat;

      this.ripples.push({ mesh, mat, bornAt: state.time, radius: snd.radius });
    }

    // 拡大・フェード・破棄
    for (let k = this.ripples.length - 1; k >= 0; k--) {
      const r = this.ripples[k];
      const t = (state.time - r.bornAt) / RIPPLE_DURATION;
      if (t >= 1) {
        r.mat.dispose();
        r.mesh.dispose();
        this.ripples.splice(k, 1);
        continue;
      }
      const d = Math.max(0.05, r.radius * 2 * t); // diameter=1 のトーラスを直径2R*tへ
      r.mesh.scaling.set(d, 1, d);
      r.mat.alpha = 0.55 * (1 - t);
    }
  }
}
