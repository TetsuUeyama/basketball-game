/**
 * 汎用ボクセルローダー
 *
 * - MagicaVoxel .vox ファイルをパース
 * - 露出面のみのメッシュを生成（内部面カリング）
 * - 複数パーツを 1 メッシュに集約可能（mergeVoxParts）
 *
 * 軸リマップ（既定）: vox X → localX, vox Z → localY(up), vox -Y → localZ(forward)
 * スケール（既定）  : 0.010 per voxel
 *
 * 既存 `VoxHeadMesh.ts` のパーサーを汎用化して外出ししたもの。
 */

import { Mesh, VertexData, Scene } from '@babylonjs/core';
import type {
  VoxCharacterRef,
  VoxPartsManifest,
  VoxBodyMetrics,
  VoxCharacterManifest,
} from './VoxCharacterTypes';

// =========================================================================
// Types
// =========================================================================

export interface VoxVoxel {
  x: number;
  y: number;
  z: number;
  colorIndex: number;
}

export interface VoxPalette {
  r: number;
  g: number;
  b: number;
}

export interface VoxModel {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  voxels: VoxVoxel[];
  palette: VoxPalette[];
}

export interface VoxBounds {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}

export interface BuildMeshOptions {
  /** voxel 単位の 1 辺をワールド何 m にするか (default 0.010) */
  scale?: number;
  /**
   * ローカル原点の取り方
   *   'centerBottom' — X/Y 中心、Z 底（VoxHeadMesh 既定: vox Z→localY なので足元原点）
   *   'base'         — 全て min 側（左下奥が原点）
   *   'center'       — 全て中心（重心位置が原点）
   *   'keep'         — vox 座標そのまま（0 を原点とする）
   */
  origin?: 'centerBottom' | 'base' | 'center' | 'keep';
  /** 軸リマップを有効にするか (default true) */
  axisRemap?: boolean;
  /** メッシュ名 */
  name?: string;
  /** パレットを上書きする単色（指定時、全頂点がこの色になる） */
  overrideColor?: VoxPalette | null;
  /** ピック対象にするか (default false) */
  pickable?: boolean;
}

export interface VoxMeshInfo {
  mesh: Mesh;
  /** メッシュの AABB（ワールド空間、軸リマップ後） */
  bounds: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
  /** 原点補正前の vox 座標系 AABB */
  rawBounds: VoxBounds;
}

// =========================================================================
// Parser
// =========================================================================

export function parseVox(buf: ArrayBuffer): VoxModel {
  const view = new DataView(buf);
  let offset = 0;

  const readU32 = () => { const v = view.getUint32(offset, true); offset += 4; return v; };
  const readU8 = () => { const v = view.getUint8(offset); offset += 1; return v; };
  const readStr = (n: number) => {
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(view.getUint8(offset + i));
    offset += n;
    return s;
  };

  const magic = readStr(4);
  if (magic !== 'VOX ') throw new Error('Not a VOX file');
  readU32(); // version

  let sizeX = 0, sizeY = 0, sizeZ = 0;
  const voxels: VoxVoxel[] = [];
  let palette: VoxPalette[] | null = null;

  const readChunks = (end: number) => {
    while (offset < end) {
      const id = readStr(4);
      const contentSize = readU32();
      const childSize = readU32();
      const contentEnd = offset + contentSize;

      if (id === 'SIZE') {
        sizeX = readU32();
        sizeY = readU32();
        sizeZ = readU32();
      } else if (id === 'XYZI') {
        const numVoxels = readU32();
        for (let i = 0; i < numVoxels; i++) {
          const x = readU8();
          const y = readU8();
          const z = readU8();
          const colorIndex = readU8();
          voxels.push({ x, y, z, colorIndex });
        }
      } else if (id === 'RGBA') {
        palette = [];
        for (let i = 0; i < 256; i++) {
          const r = readU8();
          const g = readU8();
          const b = readU8();
          readU8(); // alpha
          palette.push({ r: r / 255, g: g / 255, b: b / 255 });
        }
      }

      offset = contentEnd;
      if (childSize > 0) {
        readChunks(offset + childSize);
      }
    }
  };

  const mainId = readStr(4);
  if (mainId !== 'MAIN') throw new Error('Expected MAIN chunk');
  const mainContentSize = readU32();
  const mainChildSize = readU32();
  offset += mainContentSize;
  readChunks(offset + mainChildSize);

  if (!palette) {
    palette = [];
    for (let i = 0; i < 256; i++) {
      palette.push({ r: 0.8, g: 0.8, b: 0.8 });
    }
  }

  return { sizeX, sizeY, sizeZ, voxels, palette };
}

// =========================================================================
// Mesh builder
// =========================================================================

// 6 face directions: +X, -X, +Y, -Y, +Z, -Z
const FACE_DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];

// Quad vertices for each face direction (CCW winding when viewed from outside)
const FACE_VERTS: number[][][] = [
  [[1,0,0],[1,1,0],[1,1,1],[1,0,1]],  // +X
  [[0,0,1],[0,1,1],[0,1,0],[0,0,0]],  // -X
  [[0,1,0],[0,1,1],[1,1,1],[1,1,0]],  // +Y
  [[0,0,1],[0,0,0],[1,0,0],[1,0,1]],  // -Y
  [[0,0,1],[0,1,1],[1,1,1],[1,0,1]],  // +Z
  [[1,0,0],[1,1,0],[0,1,0],[0,0,0]],  // -Z
];

const FACE_NORMALS: number[][] = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];

function computeBounds(voxels: VoxVoxel[]): VoxBounds {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (const v of voxels) {
    if (v.x < minX) minX = v.x;
    if (v.x + 1 > maxX) maxX = v.x + 1;
    if (v.y < minY) minY = v.y;
    if (v.y + 1 > maxY) maxY = v.y + 1;
    if (v.z < minZ) minZ = v.z;
    if (v.z + 1 > maxZ) maxZ = v.z + 1;
  }
  if (!isFinite(minX)) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

/** 原点モードから (cx, cy, cz) を計算。voxel 座標空間での原点位置。 */
function computeOrigin(b: VoxBounds, mode: BuildMeshOptions['origin']): [number, number, number] {
  switch (mode) {
    case 'base':
      return [b.minX, b.minY, b.minZ];
    case 'center':
      return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2];
    case 'keep':
      return [0, 0, 0];
    case 'centerBottom':
    default:
      // X, Y は中心、Z は底（axisRemap 適用後は足元が原点 Y=0 になる）
      return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, b.minZ];
  }
}

export function buildMeshFromVoxels(
  model: VoxModel,
  scene: Scene,
  opts: BuildMeshOptions = {},
): VoxMeshInfo {
  const scale = opts.scale ?? 0.010;
  const axisRemap = opts.axisRemap ?? true;
  const name = opts.name ?? 'voxMesh';
  const pickable = opts.pickable ?? false;

  const rawBounds = computeBounds(model.voxels);
  const [cx, cy, cz] = computeOrigin(rawBounds, opts.origin ?? 'centerBottom');

  const occupied = new Set<string>();
  for (const v of model.voxels) {
    occupied.add(`${v.x},${v.y},${v.z}`);
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const override = opts.overrideColor ?? null;

  for (const voxel of model.voxels) {
    const col = override ?? (model.palette[voxel.colorIndex - 1] ?? { r: 0.8, g: 0.8, b: 0.8 });

    for (let f = 0; f < 6; f++) {
      const [dx, dy, dz] = FACE_DIRS[f];
      const nx = voxel.x + dx;
      const ny = voxel.y + dy;
      const nz = voxel.z + dz;
      if (occupied.has(`${nx},${ny},${nz}`)) continue;

      const baseIdx = positions.length / 3;
      const fv = FACE_VERTS[f];
      const fn = FACE_NORMALS[f];

      for (let vi = 0; vi < 4; vi++) {
        const rawX = (voxel.x + fv[vi][0] - cx) * scale;
        const rawY = (voxel.y + fv[vi][1] - cy) * scale;
        const rawZ = (voxel.z + fv[vi][2] - cz) * scale;

        let lx: number, ly: number, lz: number;
        let nlx: number, nly: number, nlz: number;
        if (axisRemap) {
          // vox X→localX, vox Z→localY(up), vox -Y→localZ(forward)
          lx = rawX;
          ly = rawZ;
          lz = -rawY;
          nlx = fn[0];
          nly = fn[2];
          nlz = -fn[1];
        } else {
          lx = rawX; ly = rawY; lz = rawZ;
          nlx = fn[0]; nly = fn[1]; nlz = fn[2];
        }

        positions.push(lx, ly, lz);
        normals.push(nlx, nly, nlz);
        colors.push(col.r, col.g, col.b, 1.0);
      }

      indices.push(
        baseIdx, baseIdx + 1, baseIdx + 2,
        baseIdx, baseIdx + 2, baseIdx + 3,
      );
    }
  }

  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.normals = normals;
  vertexData.colors = colors;
  vertexData.indices = indices;

  const mesh = new Mesh(name, scene);
  vertexData.applyToMesh(mesh);
  mesh.isPickable = pickable;

  // Compute transformed bounds
  const toWorld = (rx: number, ry: number, rz: number): [number, number, number] => {
    if (!axisRemap) return [rx, ry, rz];
    return [rx, rz, -ry];
  };
  const worldCorners: [number, number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const x = (i & 1 ? rawBounds.maxX : rawBounds.minX) - cx;
    const y = (i & 2 ? rawBounds.maxY : rawBounds.minY) - cy;
    const z = (i & 4 ? rawBounds.maxZ : rawBounds.minZ) - cz;
    worldCorners.push(toWorld(x * scale, y * scale, z * scale));
  }
  const wminX = Math.min(...worldCorners.map(c => c[0]));
  const wmaxX = Math.max(...worldCorners.map(c => c[0]));
  const wminY = Math.min(...worldCorners.map(c => c[1]));
  const wmaxY = Math.max(...worldCorners.map(c => c[1]));
  const wminZ = Math.min(...worldCorners.map(c => c[2]));
  const wmaxZ = Math.max(...worldCorners.map(c => c[2]));

  return {
    mesh,
    bounds: {
      min: { x: wminX, y: wminY, z: wminZ },
      max: { x: wmaxX, y: wmaxY, z: wmaxZ },
    },
    rawBounds,
  };
}

// =========================================================================
// Loaders
// =========================================================================

/** 単一 .vox ファイルを取得してパース */
export async function loadVoxFile(url: string): Promise<VoxModel> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`loadVoxFile: ${resp.status} ${url}`);
  const buf = await resp.arrayBuffer();
  return parseVox(buf);
}

/**
 * 複数 .vox を voxel 座標空間上で結合して 1 モデルにする。
 * game-assets のキャラクタ .vox は全て同じ原点座標系で配置されている想定。
 * パレットは最初のモデルのものを採用する（キャラクタ内で統一されている想定）。
 */
export function mergeVoxModels(models: VoxModel[]): VoxModel {
  if (models.length === 0) {
    return { sizeX: 0, sizeY: 0, sizeZ: 0, voxels: [], palette: [] };
  }
  let sizeX = 0, sizeY = 0, sizeZ = 0;
  const voxels: VoxVoxel[] = [];
  for (const m of models) {
    if (m.sizeX > sizeX) sizeX = m.sizeX;
    if (m.sizeY > sizeY) sizeY = m.sizeY;
    if (m.sizeZ > sizeZ) sizeZ = m.sizeZ;
    for (const v of m.voxels) voxels.push(v);
  }
  return { sizeX, sizeY, sizeZ, voxels, palette: models[0].palette };
}

/** 複数 URL から .vox を取得して 1 メッシュに集約 */
export async function mergeVoxParts(
  urls: string[],
  scene: Scene,
  opts: BuildMeshOptions = {},
): Promise<VoxMeshInfo> {
  const models = await Promise.all(urls.map(loadVoxFile));
  const merged = mergeVoxModels(models);
  return buildMeshFromVoxels(merged, scene, opts);
}

// =========================================================================
// Character manifest loader
// =========================================================================

/** API route 経由のアセット URL を組み立てる */
export function voxAssetUrl(relPath: string): string {
  return `/api/vox-assets/${relPath}`;
}

/** キャラクタの parts.json と body_metrics.json をまとめて取得 */
export async function loadVoxCharacter(ref: VoxCharacterRef): Promise<VoxCharacterManifest> {
  const base = `${ref.gender}/${ref.name}`;
  const [partsResp, metricsResp] = await Promise.all([
    fetch(voxAssetUrl(`${base}/parts.json`)),
    fetch(voxAssetUrl(`${base}/body_metrics.json`)),
  ]);
  if (!partsResp.ok) throw new Error(`loadVoxCharacter: parts.json ${partsResp.status}`);
  if (!metricsResp.ok) throw new Error(`loadVoxCharacter: body_metrics.json ${metricsResp.status}`);
  const parts = (await partsResp.json()) as VoxPartsManifest;
  const metrics = (await metricsResp.json()) as VoxBodyMetrics;
  return { gender: ref.gender, name: ref.name, parts, metrics };
}

/** parts.json 内の "file" フィールドから API URL を生成 */
export function resolvePartUrl(ref: VoxCharacterRef, file: string): string {
  // file は通常 "/female_164cm/segments/head.x.vox" 形式（先頭 /）
  const trimmed = file.startsWith('/') ? file.slice(1) : file;
  return voxAssetUrl(`${ref.gender}/${trimmed}`);
}

/** parts.json から key で URL を引く */
export function partUrlByKey(manifest: VoxCharacterManifest, key: string): string | null {
  const entry = manifest.parts.find(p => p.key === key);
  if (!entry) return null;
  return resolvePartUrl({ gender: manifest.gender, name: manifest.name }, entry.file);
}
