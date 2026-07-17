/**
 * AgentMeshes — 兵士・侵入者・監視カメラのプリミティブ表示と毎フレーム同期。
 *
 * - キャラ = カプセル＋「鼻」ボックス（ローカル+Z前方に付け、向きの目視確認用）
 * - 兵士は FSM 状態で色分け（PATROL青 / SUSPICIOUS黄 / SEARCH橙 / COMBAT赤）
 * - 向きは MeshOrientation の実測オフセット＋差分計算（回転定数の直書き禁止）
 * - 起動時に forward 実測値と検証結果を console 出力（3D座標ルールの必須チェック）
 */

import {
  Color3,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
} from '@babylonjs/core';
import type { SimState, SoldierFsmState } from '@/BaseDefense/Sim/Core/SimState';
import { dirX, dirZ } from '@/BaseDefense/Sim/Core/MathUtils';
import { measureYawOffset, setYaw, yawError } from './MeshOrientation';

const BODY_HEIGHT = 1.7;
const CAMERA_POLE_HEIGHT = 2.6;

const FSM_COLORS: Record<SoldierFsmState, string> = {
  PATROL: '#3b82f6',
  SUSPICIOUS: '#eab308',
  SEARCH: '#f97316',
  COMBAT: '#ef4444',
};
const INTRUDER_COLOR = '#dc2626';
const DEAD_COLOR = '#4b5563';

interface AgentEntry {
  root: TransformNode;
  mat: StandardMaterial;
  yawOffset: number;
}

export class AgentMeshes {
  private scene: Scene;
  private soldierEntries = new Map<number, AgentEntry>();
  private intruderEntries = new Map<number, AgentEntry>();
  private cameraHeads = new Map<number, AgentEntry>();
  private verified = false;

  constructor(scene: Scene, state: SimState) {
    this.scene = scene;

    for (const s of state.soldiers) {
      this.soldierEntries.set(s.id, this.buildPerson(`soldier_${s.id}`, FSM_COLORS.PATROL));
    }
    for (const i of state.intruders) {
      this.intruderEntries.set(i.id, this.buildPerson(`intruder_${i.id}`, INTRUDER_COLOR));
    }
    for (const c of state.cameras) {
      this.cameraHeads.set(c.id, this.buildSecurityCamera(`cam_${c.id}`, c.x, c.z));
    }
  }

  /** カプセル＋鼻ボックスの人型プリミティブ */
  private buildPerson(name: string, colorHex: string): AgentEntry {
    const root = new TransformNode(name, this.scene);

    const body = MeshBuilder.CreateCapsule(
      `${name}_body`,
      { height: BODY_HEIGHT, radius: 0.32 },
      this.scene,
    );
    body.parent = root;
    body.position.y = BODY_HEIGHT / 2;

    // 「鼻」— ローカル+Z（forward）の目印
    const nose = MeshBuilder.CreateBox(
      `${name}_nose`,
      { width: 0.14, height: 0.14, depth: 0.3 },
      this.scene,
    );
    nose.parent = root;
    nose.position.y = BODY_HEIGHT * 0.82;
    nose.position.z = 0.35;

    const mat = new StandardMaterial(`${name}_mat`, this.scene);
    mat.diffuseColor = Color3.FromHexString(colorHex);
    mat.specularColor = Color3.Black();
    body.material = mat;
    nose.material = mat;

    // forward 実測（回転ゼロ状態で一度だけ）→ 以後の向きは差分計算
    const yawOffset = measureYawOffset(root);
    if (!this.verified) {
      const f = root.forward;
      console.log(
        `[AgentMeshes] root.forward 実測 = (${f.x.toFixed(3)}, ${f.y.toFixed(3)}, ${f.z.toFixed(3)}), ` +
        `yawOffset = ${yawOffset.toFixed(4)} rad（+Z基準）`,
      );
    }
    return { root, mat, yawOffset };
  }

  /** ポール＋ヘッドの監視カメラ。ヘッドのみ回転する */
  private buildSecurityCamera(name: string, x: number, z: number): AgentEntry {
    const pole = MeshBuilder.CreateCylinder(
      `${name}_pole`,
      { diameter: 0.12, height: CAMERA_POLE_HEIGHT },
      this.scene,
    );
    pole.position.set(x, CAMERA_POLE_HEIGHT / 2, z);
    const poleMat = new StandardMaterial(`${name}_poleMat`, this.scene);
    poleMat.diffuseColor = Color3.FromHexString('#9ca3af');
    poleMat.specularColor = Color3.Black();
    pole.material = poleMat;

    const head = new TransformNode(`${name}_head`, this.scene);
    head.position.set(x, CAMERA_POLE_HEIGHT, z);

    const box = MeshBuilder.CreateBox(
      `${name}_headBox`,
      { width: 0.25, height: 0.2, depth: 0.5 },
      this.scene,
    );
    box.parent = head;
    box.position.z = 0.15; // レンズがローカル+Z前方へ突き出す

    const mat = new StandardMaterial(`${name}_mat`, this.scene);
    mat.diffuseColor = Color3.FromHexString('#e5e7eb');
    mat.specularColor = Color3.Black();
    box.material = mat;

    const yawOffset = measureYawOffset(head);
    return { root: head, mat, yawOffset };
  }

  /** SimState → メッシュへ毎フレーム反映 */
  sync(state: SimState): void {
    for (const s of state.soldiers) {
      const e = this.soldierEntries.get(s.id);
      if (!e) continue;
      e.root.position.x = s.x;
      e.root.position.z = s.z;
      setYaw(e.root, s.facing, e.yawOffset);
      const color = s.alive ? FSM_COLORS[s.fsm.state] : DEAD_COLOR;
      e.mat.diffuseColor = Color3.FromHexString(color);
      e.root.scaling.y = s.alive ? 1 : 0.25; // 死亡表現（当面）
    }

    for (const i of state.intruders) {
      const e = this.intruderEntries.get(i.id);
      if (!e) continue;
      e.root.position.x = i.x;
      e.root.position.z = i.z;
      setYaw(e.root, i.facing, e.yawOffset);
      if (!i.alive) {
        e.mat.diffuseColor = Color3.FromHexString(DEAD_COLOR);
        e.root.scaling.y = 0.25;
      }
      e.root.setEnabled(i.phase !== 'done'); // 離脱済みは非表示
    }

    for (const c of state.cameras) {
      const e = this.cameraHeads.get(c.id);
      if (!e) continue;
      setYaw(e.root, c.facing, e.yawOffset);
      // 無効化されたカメラは黒ずんだ表示に
      e.mat.diffuseColor = Color3.FromHexString(c.disabled ? '#374151' : '#e5e7eb');
    }

    // 起動後最初の同期で向き検証（3D座標ルール: 向きと移動方向の一致確認）
    if (!this.verified) {
      this.verified = true;
      const s0 = state.soldiers[0];
      const e0 = s0 ? this.soldierEntries.get(s0.id) : undefined;
      if (s0 && e0) {
        e0.root.computeWorldMatrix(true);
        const err = yawError(e0.root, s0.facing);
        console.log(
          `[AgentMeshes] 向き検証: soldier#${s0.id} facing=${s0.facing.toFixed(3)} rad, ` +
          `期待方向=(${dirX(s0.facing).toFixed(3)}, ${dirZ(s0.facing).toFixed(3)}), ` +
          `メッシュforwardとの誤差=${err.toFixed(5)} rad ${Math.abs(err) < 0.01 ? '✓' : '✗ 要確認'}`,
        );
      }
    }
  }
}
