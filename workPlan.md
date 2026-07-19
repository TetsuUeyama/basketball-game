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

## Phase 3: 警戒FSM＋無線＋監視カメラ反応（✅ 2026-07-18 完了）

- `AI/DefenderFSM`: PATROL→SUSPICIOUS（凝視→接近調査）→SEARCH（最終目撃地点へ収束・徘徊捜索・首振り）→COMBAT。
  エスカレーション即時／デエスカレーションはヒステリシス＋最低滞在1.5秒
- `AI/RadioNet`: COMBAT突入・カメラ検知を遅延2秒で全兵士へ配送 → 受信者はSEARCHで現地収束
- 受入基準（ハーネス✅）: カメラ検知の無線→兵士が報告位置6m以内へ収束 / 1秒未満のデエスカレーション往復ゼロ

## Phase 4: 交戦・侵入者AI（コア部分 ✅ 2026-07-18 / 残りは次回以降）

実装済み:
- `Combat/Engagement`: 射撃（射程18m/クールダウン/距離減衰命中率/走行標的ペナルティ×0.6/遮蔽チェック/銃声55m）。HP・死亡
- `AI/IntruderAI`（隠密行動）: 視認中の兵士＋既知カメラの視界コーンを脅威評価。
  先読み位置がコーン内→待機（兵士30秒/カメラ6秒でタイムアウト→強行突破）／
  コーン内に入ったら走って離脱（進行方向に兵士がいれば retreatIdx で経路を遡って後退、
  兵士が走行音圏内なら歩いて静かに抜ける）／至近の兵士に塞がれたら距離を取る／
  被弾・銃声・交戦兵視認で逃走（侵入経路を逆走）→機密なし軽傷なら離脱ゾーンで潜伏し熱が冷めたら任務再開
- 受入基準（ハーネス✅）: 交戦シナリオ全決着 / デフォルト試合20シードで防衛側勝率90%（帯域5〜95%内・侵入成功2/20）

追加実装（2026-07-18(2)）:
- **カメラ無効化（サボタージュ）**: スパイ/忍者はカメラのコーンを横切らずに背後へ回り込めるなら
  忍び足で接近→至近3秒作業で無効化（作業中は首振り警戒・兵士12m接近で中断退避）
- **映像喪失の管制対応**: 無効化10秒後に気づき、カメラ位置を無線→兵士が調査収束
- S1巡回に金庫ドア前チェック / 機密入手後は足音圏外なら走って離脱 / 確信速度の距離スケール /
  軌道トラップ修正（effectiveArrive = 最小旋回半径以上）

追加実装（2026-07-19）— チェックポイント制:
- **チェックポイント5か所のうち3つを修理するとゴールの門（機密庫の扉）が開放**され、
  機密を持って逃げ切れば侵入側の勝ち。扉は閉鎖状態で開始（遮蔽/衝突/描画とも動的反映）
- 遮蔽物8個追加（クレート7＋中庭遮蔽壁w1 — w1と建物Aの間の2mスロットが金庫への隠密進入路）
- 守備側視界を70°に縮小（ユーザー指定）。カメラ視程13m・門カメラ首振り±25°
- 兵士射程12m化（発見=即死を廃し逃走の目を残す）・巡回開始位置のシードランダム化・
  スタック検知迂回・修理保留ウェイポイント
- 検証: 3修理到達19/20・門整合性PASS・防衛側勝率95%（完全成功1/20）

残り（次回）:
- 忍者（背後ステルスキル・高速サボタージュ）/ 部隊（3人強襲・反撃）の IntruderProfiles
- NavGrid A* による動的経路（現状はスクリプト経路＋回避動作のみ）・遮蔽物への隠れ込み
- 死体発見システム・勝率バランス微調整（現状 防衛95% → 目標: タイプ別30〜80%）

## Phase 5: 配置フェーズUI（次回以降）

- `Setup/SetupPanel`: 配置⇄観戦モード切替。地面ピッキングで巡回ウェイポイント編集・カメラ配置・開始/リスタート
- 受入基準: 編集したルート・カメラ位置が実試合に反映される（目視＋SimStateダンプ）

## 既知の注意点

- ⚠️ **WebGL実機（ブラウザ目視）は未検証**。ハーネスで検証できるのはロジックのみ。見た目・カメラ・コーン描画は `yarn dev` での playtest が必須
- ドア開閉は未実装（常時開の出入口扱い。`isWallActive` が開閉から遮蔽/衝突を毎回導出する構造は準備済み）
- 侵入者の経路は現状スクリプト固定（MatchConfig）。Phase 4 で A* 動的経路化
