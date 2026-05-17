/**
 * game-assets/vox/<gender>/<name>/ 配下の parts.json / body_metrics.json の型定義
 */

/** parts.json の 1 エントリ */
export interface VoxPartEntry {
  key: string;
  file: string;
  voxels: number;
  default_on: boolean;
  meshes: string[];
  is_body: boolean;
  category: string;
}

export type VoxPartsManifest = VoxPartEntry[];

/** body_metrics.json の 1 ボーンメトリクス */
export interface VoxBoneMetric {
  bone_length: number;
  width: number;
  depth: number;
  vertex_count: number;
  head: [number, number, number];
  tail: [number, number, number];
}

export interface VoxBodyMetrics {
  model: string;
  body_height: number;
  metrics: Record<string, VoxBoneMetric>;
}

/** 1 キャラクタ分のアセット記述 */
export interface VoxCharacterManifest {
  gender: 'male' | 'female';
  name: string;
  parts: VoxPartsManifest;
  metrics: VoxBodyMetrics;
}

/**
 * basketball-game で使う論理パーツ名（粗粒度: 肩→肘→手首の 2 関節、膝なし）
 * 各論理パーツは game-assets の細粒度パーツを集約して構築する。
 */
export type LogicalBodyPart =
  | 'head'
  | 'torso'
  | 'hips'
  | 'upperArmL' | 'upperArmR'
  | 'forearmL'  | 'forearmR'
  | 'handL'     | 'handR'
  | 'legL'      | 'legR'
  | 'footL'     | 'footR';

/** 論理パーツ → game-assets キー群 の集約マッピング */
export const DEFAULT_AGGREGATION: Record<LogicalBodyPart, string[]> = {
  head:       ['head.x', 'neck.x', 'jawbone.x', 'c_eye.l', 'c_eye.r', 'c_ear_01.l', 'c_ear_01.r', 'c_ear_02.l', 'c_ear_02.r'],
  torso:      ['c_spine_01_bend.x', 'c_spine_02_bend.x', 'c_spine_03_bend.x', 'breast.l', 'breast.r'],
  hips:       ['c_root_bend.x'],
  upperArmL:  ['shoulder.l', 'c_arm_stretch.l', 'c_arm_twist.l', 'c_arm_twist_2.l'],
  upperArmR:  ['shoulder.r', 'c_arm_stretch.r', 'c_arm_twist.r', 'c_arm_twist_2.r'],
  forearmL:   ['c_forearm_stretch.l', 'c_forearm_twist.l', 'c_forearm_twist_2.l'],
  forearmR:   ['c_forearm_stretch.r', 'c_forearm_twist.r', 'c_forearm_twist_2.r'],
  handL:      ['hand.l'],
  handR:      ['hand.r'],
  legL:       ['c_thigh_stretch.l', 'c_thigh_twist.l', 'c_thigh_twist_2.l', 'c_leg_stretch.l', 'c_leg_twist.l', 'c_leg_twist_2.l'],
  legR:       ['c_thigh_stretch.r', 'c_thigh_twist.r', 'c_thigh_twist_2.r', 'c_leg_stretch.r', 'c_leg_twist.r', 'c_leg_twist_2.r'],
  footL:      ['foot.l'],
  footR:      ['foot.r'],
};

/** キャラクタ識別（例: { gender: 'female', name: 'female_164cm' }） */
export interface VoxCharacterRef {
  gender: 'male' | 'female';
  name: string;
}
