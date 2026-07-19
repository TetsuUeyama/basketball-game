/**
 * MapMeshBuilder — BaseMap（壁線分データ）から3Dメッシュを生成。
 *
 * ジオメトリの真実は Sim 側の BaseMap。ここは描画するだけで独自形状を持たない。
 * 壁ボックスの向きは MeshOrientation の実測オフセット＋差分計算で決める。
 * ドア（ゴールの門）とチェックポイントは実行時状態で表示が変わるため
 * sync(state) を毎フレーム呼んで反映する。
 */

import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
} from '@babylonjs/core';
import type { BaseMap } from '@/BaseDefense/Sim/Map/MapTypes';
import type { SimState } from '@/BaseDefense/Sim/Core/SimState';
import { angleOf, dist2d } from '@/BaseDefense/Sim/Core/MathUtils';
import { measureYawOffset, setYaw } from './MeshOrientation';

const WALL_THICKNESS = 0.25;

export interface MapViz {
  /** ドア開閉・チェックポイント修理状態をメッシュに反映する */
  sync(state: SimState): void;
}

export function buildMapMeshes(scene: Scene, map: BaseMap): MapViz {
  // ---- 地面 ----
  const ground = MeshBuilder.CreateGround(
    'ground',
    { width: map.width, height: map.depth },
    scene,
  );
  const groundMat = new StandardMaterial('groundMat', scene);
  groundMat.diffuseColor = Color3.FromHexString('#2e3438');
  groundMat.specularColor = Color3.Black();
  ground.material = groundMat;

  // ---- マテリアル（種類ごとに共有） ----
  const wallMat = new StandardMaterial('wallMat', scene);
  wallMat.diffuseColor = Color3.FromHexString('#8a8f96');
  wallMat.specularColor = Color3.Black();

  const fenceMat = new StandardMaterial('fenceMat', scene);
  fenceMat.diffuseColor = Color3.FromHexString('#6b7f8f');
  fenceMat.alpha = 0.35; // 金網 — 視線が通ることを表現
  fenceMat.specularColor = Color3.Black();

  const crateMat = new StandardMaterial('crateMat', scene);
  crateMat.diffuseColor = Color3.FromHexString('#7a6844');
  crateMat.specularColor = Color3.Black();

  // ドア用マテリアル（ゴールの門 — 目立つ暗赤の金属扉）
  const doorMat = new StandardMaterial('doorMat', scene);
  doorMat.diffuseColor = Color3.FromHexString('#7f1d1d');
  doorMat.emissiveColor = Color3.FromHexString('#450a0a');
  doorMat.specularColor = Color3.Black();

  const doorMeshes: { doorId: number; mesh: Mesh }[] = [];

  // ---- 壁線分 → ボックス（ドアは開閉を sync で反映するため常に生成） ----
  map.walls.forEach((w, idx) => {
    const len = dist2d(w.x1, w.z1, w.x2, w.z2);
    if (len < 0.01) return;
    const h = w.height ?? 3.0;
    const box = MeshBuilder.CreateBox(
      `wall_${idx}`,
      { width: WALL_THICKNESS, height: h, depth: len },
      scene,
    );
    box.position.x = (w.x1 + w.x2) / 2;
    box.position.z = (w.z1 + w.z2) / 2;
    box.position.y = h / 2;
    // ボックスの長軸(ローカル+Z)を線分方向へ — 実測オフセット差分で回転
    const yawOffset = measureYawOffset(box);
    setYaw(box, angleOf(w.x2 - w.x1, w.z2 - w.z1), yawOffset);

    if (w.doorId !== undefined) {
      box.material = doorMat;
      doorMeshes.push({ doorId: w.doorId, mesh: box });
      const door = map.doors.find((d) => d.id === w.doorId);
      box.setEnabled(door ? !door.open : true);
    } else {
      box.material = !w.blocksVision ? fenceMat : h < 2.0 ? crateMat : wallMat;
    }
  });

  // ---- チェックポイント（配電盤） ----
  const cpMeshes: { id: number; mat: StandardMaterial }[] = [];
  map.checkpoints.forEach((cp) => {
    const box = MeshBuilder.CreateBox(
      `checkpoint_${cp.id}`,
      { width: 0.6, height: 1.1, depth: 0.35 },
      scene,
    );
    box.position.set(cp.x, 0.55, cp.z);
    const mat = new StandardMaterial(`checkpointMat_${cp.id}`, scene);
    mat.diffuseColor = Color3.FromHexString('#7f1d1d');
    mat.emissiveColor = Color3.FromHexString('#dc2626'); // 未修理 = 赤
    mat.specularColor = Color3.Black();
    box.material = mat;
    cpMeshes.push({ id: cp.id, mat });
  });

  // ---- 目標（機密） ----
  const objective = MeshBuilder.CreateCylinder(
    'objective',
    { diameter: 0.8, height: 1.0 },
    scene,
  );
  objective.position.set(map.objective.x, 0.5, map.objective.z);
  const objMat = new StandardMaterial('objMat', scene);
  objMat.emissiveColor = Color3.FromHexString('#eab308');
  objMat.diffuseColor = Color3.FromHexString('#eab308');
  objective.material = objMat;

  // ---- 離脱ゾーン ----
  const exfilMat = new StandardMaterial('exfilMat', scene);
  exfilMat.emissiveColor = Color3.FromHexString('#22c55e');
  exfilMat.alpha = 0.3;
  exfilMat.specularColor = Color3.Black();
  map.exfilZones.forEach((z, idx) => {
    const disc = MeshBuilder.CreateCylinder(
      `exfil_${idx}`,
      { diameter: z.r * 2, height: 0.05 },
      scene,
    );
    disc.position.set(z.x, 0.03, z.z);
    disc.material = exfilMat;
  });

  // ---- 実行時状態の反映 ----
  return {
    sync(state: SimState): void {
      for (const d of doorMeshes) {
        const door = state.map.doors.find((dd) => dd.id === d.doorId);
        d.mesh.setEnabled(door ? !door.open : true);
      }
      for (const cpm of cpMeshes) {
        const cp = state.checkpoints.find((c) => c.id === cpm.id);
        if (cp) {
          cpm.mat.emissiveColor = Color3.FromHexString(
            cp.repaired ? '#22c55e' : '#dc2626', // 修理済み = 緑
          );
        }
      }
    },
  };
}
