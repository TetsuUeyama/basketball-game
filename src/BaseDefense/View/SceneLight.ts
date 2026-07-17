/**
 * SceneLight — 環境光＋太陽光。旧 Object/Entities/Light.ts の設定を移植。
 */

import { DirectionalLight, HemisphericLight, Scene, Vector3 } from '@babylonjs/core';

export const LIGHT_CONFIG = {
  ambient: {
    intensity: 0.65,
  },
  directional: {
    intensity: 0.75,
    direction: { x: -1, y: -3, z: -1 },
  },
} as const;

export function createLights(scene: Scene): void {
  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
  ambient.intensity = LIGHT_CONFIG.ambient.intensity;

  const d = LIGHT_CONFIG.directional.direction;
  const sun = new DirectionalLight('sun', new Vector3(d.x, d.y, d.z), scene);
  sun.intensity = LIGHT_CONFIG.directional.intensity;
}
