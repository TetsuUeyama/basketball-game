/**
 * SceneCamera — 基地全体を見渡す俯瞰カメラ。
 *
 * 旧 Object/Entities/Camera.ts の ArcRotateCamera ファクトリを縮小移植。
 * 配置は「マップ南側（-Z側）から北（+Z）を見下ろす」= 画面奥が北。
 * alpha はカメラの水平配置方向ベクトルから atan2 で導出（角度定数の直書きをしない）。
 */

import { ArcRotateCamera, Scene, Vector3 } from '@babylonjs/core';
import { degToRad } from '@/BaseDefense/Sim/Core/MathUtils';

export function createOverheadCamera(
  scene: Scene,
  canvas: HTMLCanvasElement,
  mapWidth: number,
  mapDepth: number,
): ArcRotateCamera {
  // カメラをマップ南側 (-Z方向) に配置する。
  // ArcRotateCamera の水平位置は (cosα, sinα) が (X, Z) に対応するため
  // 配置方向ベクトル (0, -1) から α を導出する。
  const placeDirX = 0;
  const placeDirZ = -1;
  const alpha = Math.atan2(placeDirZ, placeDirX);

  // 見下ろし角。beta は天頂からの角度で、35° = かなり上からの高俯瞰
  const beta = degToRad(35);

  const radius = Math.max(mapWidth, mapDepth) * 1.05;

  const camera = new ArcRotateCamera(
    'overhead',
    alpha,
    beta,
    radius,
    new Vector3(0, 0, 0),
    scene,
  );
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 10;
  camera.upperRadiusLimit = radius * 2;
  camera.lowerBetaLimit = degToRad(5);
  camera.upperBetaLimit = degToRad(80);
  camera.minZ = 0.1;
  camera.maxZ = 1000;
  camera.wheelPrecision = 10;
  return camera;
}
