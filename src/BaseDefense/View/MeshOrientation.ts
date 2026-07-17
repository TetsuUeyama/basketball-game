/**
 * MeshOrientation — メッシュの向き制御（3D座標ルール準拠の唯一の窓口）。
 *
 * 回転のハードコード禁止ルールに従い、
 *  1. ノードの forward（ローカル+Zのワールド方向）を実測して基準オフセットを求め、
 *  2. 目標向き（+Z基準の角度）との差分から rotation.y を計算する。
 * モデル（プリミティブ/将来のGLB）ごとの forward 差はオフセットが吸収する。
 */

import type { TransformNode } from '@babylonjs/core';
import { angleOf } from '@/BaseDefense/Sim/Core/MathUtils';

/**
 * ノードの現在 forward を実測し、+Z基準のヨー角オフセットを返す。
 * 生成直後（rotation=0）に一度呼んで保存しておく。
 */
export function measureYawOffset(node: TransformNode): number {
  const f = node.forward;
  return angleOf(f.x, f.z);
}

/**
 * 目標向き targetAngle（+Z基準rad）へ向ける。
 * 実測オフセットとの差分で rotation.y を決める（定数のハードコード禁止）。
 */
export function setYaw(node: TransformNode, targetAngle: number, yawOffset: number): void {
  node.rotation.y = targetAngle - yawOffset;
}

/**
 * 検証用: ノードの現在 forward が期待角度と一致しているかを返す（rad差）。
 * 起動時の座標系チェックログに使う。
 */
export function yawError(node: TransformNode, expectedAngle: number): number {
  const f = node.forward;
  const actual = angleOf(f.x, f.z);
  let d = actual - expectedAngle;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
