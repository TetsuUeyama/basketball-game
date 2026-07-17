/**
 * VisionConeViz — 視界コーンの可視化。
 *
 * 各観察者（兵士=周辺視野+中心視野の2枚 / カメラ=1枚）ごとに
 * 三角形ファンのカスタムメッシュを作り、毎フレーム castRayDistance で
 * 壁にクリップされた扇形を頂点バッファ更新（updateVerticesData）で描く。
 * 地面に投影した平面扇形（y一定）— 俯瞰視点での定番表現。
 */

import {
  Color3,
  Mesh,
  Scene,
  StandardMaterial,
  VertexBuffer,
  VertexData,
} from '@babylonjs/core';
import type { SimState } from '@/BaseDefense/Sim/Core/SimState';
import { castRayDistance } from '@/BaseDefense/Sim/Map/Occlusion';
import { dirX, dirZ } from '@/BaseDefense/Sim/Core/MathUtils';
import { SOLDIER_VISION, CAMERA_VISION } from '@/BaseDefense/Sim/Config/PerceptionConfig';

/** 扇形のレイ本数（頂点数 = RAYS + 2） */
const RAYS = 24;
const CONE_Y = 0.06;

interface ConeEntry {
  mesh: Mesh;
  mat: StandardMaterial;
  positions: Float32Array;
  /** 対象エンティティ種別とID */
  kind: 'soldierPeripheral' | 'soldierCentral' | 'camera';
  ownerId: number;
  halfAngle: number;
  range: number;
}

const COLOR_IDLE = {
  soldierPeripheral: '#60a5fa',
  soldierCentral: '#fbbf24',
  camera: '#34d399',
} as const;
const COLOR_DETECTING = '#ef4444';

export class VisionConeViz {
  private entries: ConeEntry[] = [];

  constructor(scene: Scene, state: SimState) {
    for (const s of state.soldiers) {
      this.entries.push(
        this.buildCone(scene, 'soldierPeripheral', s.id,
          SOLDIER_VISION.peripheralHalfAngle, SOLDIER_VISION.peripheralRange, 0.10),
        this.buildCone(scene, 'soldierCentral', s.id,
          SOLDIER_VISION.centralHalfAngle, SOLDIER_VISION.centralRange, 0.16),
      );
    }
    for (const c of state.cameras) {
      this.entries.push(
        this.buildCone(scene, 'camera', c.id,
          CAMERA_VISION.centralHalfAngle, CAMERA_VISION.centralRange, 0.14),
      );
    }
  }

  private buildCone(
    scene: Scene,
    kind: ConeEntry['kind'],
    ownerId: number,
    halfAngle: number,
    range: number,
    alpha: number,
  ): ConeEntry {
    const mesh = new Mesh(`cone_${kind}_${ownerId}`, scene);
    const vertCount = RAYS + 2; // 頂点0 = apex、1..RAYS+1 = 弧
    const positions = new Float32Array(vertCount * 3);
    const indices: number[] = [];
    for (let k = 0; k < RAYS; k++) {
      indices.push(0, k + 1, k + 2);
    }
    const vertexData = new VertexData();
    vertexData.positions = Array.from(positions);
    vertexData.indices = indices;
    vertexData.applyToMesh(mesh, true); // updatable

    const mat = new StandardMaterial(`coneMat_${kind}_${ownerId}`, scene);
    mat.emissiveColor = Color3.FromHexString(COLOR_IDLE[kind]);
    mat.disableLighting = true;
    mat.alpha = alpha;
    mat.backFaceCulling = false;
    mesh.material = mat;
    mesh.isPickable = false;

    return { mesh, mat, positions, kind, ownerId, halfAngle, range };
  }

  sync(state: SimState): void {
    for (const e of this.entries) {
      let x = 0;
      let z = 0;
      let facing = 0;
      let visible = true;
      let detecting = false;

      if (e.kind === 'camera') {
        const c = state.cameras.find((cc) => cc.id === e.ownerId);
        if (!c || c.disabled) visible = false;
        else {
          x = c.x; z = c.z; facing = c.facing;
          detecting = c.visibleIntruders.size > 0;
        }
      } else {
        const s = state.soldiers.find((ss) => ss.id === e.ownerId);
        if (!s || !s.alive) visible = false;
        else {
          x = s.x; z = s.z; facing = s.neckFacing; // 視線=首の向き
          detecting = s.visibleIntruders.size > 0;
        }
      }

      e.mesh.setEnabled(visible);
      if (!visible) continue;

      // 頂点更新: apex + 弧上の点（壁でクリップ）
      e.positions[0] = x;
      e.positions[1] = CONE_Y;
      e.positions[2] = z;
      for (let k = 0; k <= RAYS; k++) {
        const a = facing - e.halfAngle + (2 * e.halfAngle * k) / RAYS;
        const dist = castRayDistance(state.map, x, z, dirX(a), dirZ(a), e.range);
        const vi = (k + 1) * 3;
        e.positions[vi] = x + dirX(a) * dist;
        e.positions[vi + 1] = CONE_Y;
        e.positions[vi + 2] = z + dirZ(a) * dist;
      }
      e.mesh.updateVerticesData(VertexBuffer.PositionKind, e.positions as unknown as number[], false, false);
      e.mesh.refreshBoundingInfo();

      e.mat.emissiveColor = Color3.FromHexString(
        detecting ? COLOR_DETECTING : COLOR_IDLE[e.kind],
      );
    }
  }
}
