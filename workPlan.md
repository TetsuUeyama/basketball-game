# 作業計画 (Work Plan) — 基地防衛シミュレーション

## 概要

バスケットボールゲームは 2026-07-17 に全破棄（git履歴には残存）。本プロジェクトは以後
「**基地防衛シミュレーション**」— 基地に侵入するスパイ・忍者・部隊を、兵士や監視カメラ等で
検知（視界・音）し、実力行使で排除する**観戦型シミュレーション** — を開発する。

1. **知覚システム** — 視界コーン（中心視/周辺視の2層FOV＋壁遮蔽）と聴覚（音の半径伝播・壁越し減衰）による侵入検知
2. **警戒FSM** — 防衛側 AI は `PATROL → SUSPICIOUS → SEARCH → COMBAT` を遷移。検知情報は遅延付き無線で共有
3. **排除と侵入者AI** — 発見後の射撃/近接排除。侵入者（スパイ/忍者/部隊）は隠密・反撃・逃走・ステルスキルを選択
4. **配置フェーズ** — プレイヤーが兵士の巡回ルート・カメラ等を配置してから侵入開始 → AI同士の攻防を観戦

## 設計方針

- **スタック**: Next.js 15 + TypeScript + Babylon.js 8（3D俯瞰）+ Tailwind。物理エンジン不使用（キネマティック決定論制御。Havok は除去済み）
- **Sim / View 分離**: `src/BaseDefense/Sim/` は `@babylonjs/core` を一切 import しない（eslint no-restricted-imports で強制）。
  プレーンデータ構造体＋純関数 update で、Node から `yarn sim` で直接ヘッドレス統計検証できる
- **遮蔽・衝突は自前の2D線分幾何**: 壁線分群 `WallSeg[]` が視線遮蔽 / 移動衝突 / （将来の）A* の唯一の真実。Babylon Ray 不使用
- **角度規約**: forward = +Z。角度は `MathUtils.angleOf(dx,dz) = atan2(dx,dz)` の一元定義。
  メッシュ回転は `View/MeshOrientation.ts` の「forward実測オフセット＋差分計算」のみ（回転定数のハードコード禁止）
- **乱数**: シード付きRNG（mulberry32）を SimState に注入。`Math.random` 直呼び禁止（決定論＝ハーネス再現性）
- **検証**: イベント発火数だけでなく座標・時刻の幾何も必ず計測（soccer-sim の偽陽性教訓）

### ディレクトリ構成

```
src/BaseDefense/
  Sim/         ヘッドレス実行可能なシミュレーションコア（Babylon非依存）
    Core/      SimState / SimLoop / SimEvents / Random / MathUtils
    Config/    PerceptionConfig / AgentConfig / AlertConfig / MapDef / MatchConfig
    Map/       MapTypes / Occlusion(線分交差) / Collision(円vs線分) / NavGrid(将来)
    Perception/ Vision(2層FOV+記憶) / Hearing / PerceptionUpdate
    Movement/  MovementCore / PatrolFollower
    AI/        DefenderFSM / DefenderBehaviors / RadioNet / IntruderAI / IntruderProfiles（Phase 3-4）
    Combat/    Engagement（Phase 4）
    Rules/     WinLose
  View/        Babylon依存レイヤ（SimStateを読むだけ）
    ScenePanel / SceneCamera / SceneLight / MapMeshBuilder / AgentMeshes /
    VisionConeViz / SoundRippleViz / HudOverlay / MeshOrientation
  Setup/       配置フェーズUI（Phase 5）
harness/       run-sim.ts（ヘッドレス統計検証。yarn sim）/ scenarios.ts
```

## Phase 0: 破棄・サルベージ（✅ 2026-07-17 完了）

- 旧 `src/GamePlay`(129) / `src/SimulationPlay`(41) / `src/app/api` を削除
- 汎用基盤を移植: Vision（2層FOV+視認記憶→Config注入・+Z規約化・遮蔽フック追加）、
  MovementCore（旋回/分離→バスケ依存除去）、Camera/Light（俯瞰用に縮小）、Babylonブートストラップ骨格
- `@babylonjs/havok` 除去、`tsx` 追加、name → base-defense-sim

## Phase 1: マップ＋巡回が動く3D表示（✅ 同日完了）

- 基地マップ1面（外周フェンス＋南門・機密庫・兵舎・クレート）、兵士3体の巡回、侵入者（スパイ）のスクリプト経路
- 受入基準: 兵士が壁を貫通せず周回 / カプセルの鼻の向き=進行方向 / 回転は forward 差分計算のみ / build 成功

## Phase 2: 知覚＋可視化＋ハーネス（✅ 同日完了）

- 視線遮蔽（線分交差）・聴覚（壁越し減衰）・視界コーン描画（レイファン24本、壁クリップ、頂点バッファ更新）・音波紋
- 受入基準（`yarn sim` で自動検証）:
  - コーン横断シナリオで視認率 100%（座標付き検証）
  - 壁裏シナリオで視認 0%
  - 聴覚: run(半径13m)=聴取あり / walk(5m)=距離10mで聴取なし / sneak=無音
  - 同一シード2回実行で座標完全一致（決定論）

## Phase 3: 警戒FSM＋無線＋監視カメラ反応（次回）

- `AI/DefenderFSM`: suspicion蓄積→SUSPICIOUS（凝視・接近）→SEARCH（最終目撃地点へ収束・周辺捜索）→COMBAT。
  ヒステリシス（AlertConfig 設定済み）＋最低滞在時間でフラッピング防止
- `AI/RadioNet`: 検知情報（最終目撃位置）を遅延2秒で他兵士へ配送。カメラ検知も無線経由で兵士を動かす
- 受入基準（ハーネス）: 発見→N秒後に周辺兵士がSEARCHで収束（位置で検証）/ 刺激消失後にPATROL復帰 / 1秒未満の状態フラッピングなし

## Phase 4: 交戦・勝敗・侵入者3タイプ（次回以降）

- `Combat/Engagement`: 射撃（射程/クールダウン/命中）・近接・背後ステルスキル。HP・死亡・死体発見
- `AI/IntruderAI` + `IntruderProfiles`: スパイ（回避経路優先）/ 忍者（ステルスキル・カメラ無効化）/ 部隊（3人強襲）。
  `knownThreats`（自視界で学習した警備情報）ベースの経路選択 — 全知にしない。NavGrid A* もここで導入
- 受入基準: ハーネスN=100で全試合決着、防衛側勝率がタイプ別 30〜80% の帯域

## Phase 5: 配置フェーズUI（次回以降）

- `Setup/SetupPanel`: 配置⇄観戦モード切替。地面ピッキングで巡回ウェイポイント編集・カメラ配置・開始/リスタート
- 受入基準: 編集したルート・カメラ位置が実試合に反映される（目視＋SimStateダンプ）

## 既知の注意点

- ⚠️ **WebGL実機（ブラウザ目視）は未検証**。ハーネスで検証できるのはロジックのみ。見た目・カメラ・コーン描画は `yarn dev` での playtest が必須
- ドア開閉は未実装（常時開の出入口扱い。`isWallActive` が開閉から遮蔽/衝突を毎回導出する構造は準備済み）
- 侵入者の経路は現状スクリプト固定（MatchConfig）。Phase 4 で A* 動的経路化
