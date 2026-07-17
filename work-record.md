# 作業記録 (Work Record) — 基地防衛シミュレーション

※ バスケットボールゲーム時代の作業記録は git 履歴（コミット ecc7455 以前）を参照。

## 2026-07-17

### プロジェクト転換: バスケゲーム全破棄 → 基地防衛シミュレーション新規立ち上げ

ユーザー指示によりバスケットボールゲームを破棄し、「基地防衛シミュレーション」
（侵入者 vs 防衛AI の観戦型・Babylon.js 3D俯瞰・視界/音による検知＋実力排除）へ転換。
プレイ形式=観戦型 / 描画=Babylon 3D俯瞰 / 旧コード=未コミット変更ごと即削除、はユーザー決定。

**Phase 0 — 破棄・サルベージ:**
- 削除: `src/GamePlay`(129ファイル) / `src/SimulationPlay`(41) / `src/app/api`。`@babylonjs/havok` 除去（物理エンジン不使用）
- サルベージ移植（コピー後に旧版削除）:
  - `Game/Body/Vision.ts` → `Sim/Perception/Vision.ts` — 2層FOV(中心視/周辺視)+視認記憶を継承。
    **角度規約を atan2(dz,dx)(+X基準) → angleOf(dx,dz)(+Z基準) に置換**。FOV定数はConfig注入化
    （旧値: 記憶2秒/視程12m はバスケ用 → 警備用に記憶30秒/中心視22m へ）。遮蔽フック `isOccluded` を canSee に追加
  - `Game/Movement/MovementCore.ts` → `Sim/Movement/MovementCore.ts` — turnToward/turnNeckToward/dirSpeedMult/
    separateEntities(二重キャップ押し離し) を継承。FieldConfig/CenterOfMass依存と Math.random 直呼びを除去
  - `Object/Entities/Camera.ts`/`Light.ts` → `View/SceneCamera.ts`/`SceneLight.ts`（俯瞰1プリセットに縮小）
  - `TrackingSimulationPanel.tsx` の Engine/Scene/resize/dispose 骨格 → `View/ScenePanel.tsx`（Havok初期化ブロック削除）
- `package.json`: name → `base-defense-sim`、`tsx` 追加、`yarn sim` スクリプト新設
- eslint: `src/BaseDefense/Sim/**` に `no-restricted-imports`（@babylonjs/* 禁止）を追加 — Simコアの純度を機械的に強制
- 注意: `yarn` は Node 23.11.0 と eslint-visitor-keys の engines 宣言が衝突するため **`--ignore-engines` が必要**

**Phase 1 — マップ＋巡回:**
- `Sim/Config/MapDef.ts`: 60×40m 基地1面（外周フェンス=視線透過・南門開口 / 機密庫(建物A)+ドア /
  兵舎(建物B)+ドア / クレート3つ / 南門外にスポーン・離脱ゾーン）。壁線分 `WallSeg[]` が遮蔽・衝突の唯一の真実
- `Sim/Map/Collision.ts`: 円vs線分の位置押し出し（緩和2パス）。`Sim/Movement/PatrolFollower.ts`: cycle/pingpong 巡回
  ＋ウェイポイント待機時の lookAngle 注視（首=neckFacing は体の±70°クランプ）
- `View/MeshOrientation.ts`: **回転は「rootのforward実測オフセット」と「目標向き」の差分計算のみ**。
  起動時に forward 実測値と向き誤差を console 出力（3D座標ルールの実装前チェック/最終検証に対応）
- 兵士=青カプセル+鼻ボックス（FSM状態で色分け予定）、侵入者=赤、カメラ=ポール+ヘッド（首振り）

**Phase 2 — 知覚＋可視化＋ハーネス:**
- `Sim/Map/Occlusion.ts`: 線分交差の遮蔽判定 + `castRayDistance`（コーン描画クリップ用レイ）
- `Sim/Perception/`: 兵士視覚（首向き基準・遮蔽込み・立ち上がりのみイベント記録）/ カメラ視覚（首振りsweep）/
  聴覚（足音: sneak無音・walk5m・run13m、壁1枚ごと×0.45減衰）/ 侵入者側の脅威学習（knownThreats — 全知にしない）
- suspicion 蓄積・自然減衰まで実装（FSM遷移=行動変化は Phase 3）
- `View/VisionConeViz.ts`: レイファン24本・壁クリップ・頂点バッファ更新（毎フレーム再生成しない）。
  兵士=周辺視野(青)+中心視野(黄)の2枚、カメラ=緑1枚、検知中は赤
- `View/SoundRippleViz.ts`: 音イベント→拡大リング（走行音は大きく赤系）
- `harness/run-sim.ts`（`yarn sim`）: コーン横断=視認率100%（座標検証付き）/ 壁裏=0% / 聴覚 run>0・walk=0・sneak=0 /
  同一シード決定論 / デフォルト試合20シードの参考統計

**検証結果:**
- `npx tsc --noEmit` / `yarn build` / `yarn sim` → 本記録の末尾「検証」参照
- ⚠️ WebGL実機（ブラウザ目視）未検証 — 見た目・カメラ・コーン描画は次回 `yarn dev` で playtest 必要

**引き継ぎ事項:**
- 次フェーズ = Phase 3（警戒FSM＋無線）。workPlan.md の Phase 3 受入基準を参照
- 侵入者経路はスクリプト固定（`MatchConfig.createDefaultSetup`）。動的経路（A*）は Phase 4
- ドアは常時開扱い（開閉メカニクス未実装、構造は準備済み）
