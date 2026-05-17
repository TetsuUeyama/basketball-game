# 作業計画 (Work Plan)

## 概要

`/character-move-1on1` で動いている TrackingSimulation3D をバスケットボール試合の基盤として拡張する。
大きな軸は以下の 4 つ:

1. **キャラクター Body のボクセル化** — 現状のプリミティブ合成（八角柱上半身・シリンダー腕/脚・球の肘手・Box足・ボクセル頭）を、共有アセット `C:\Users\user\developsecond\game-assets\vox` 配下のパーツ分割 `.vox` に置き換える。モーションロジック（IK・肘ヒント・歩行振り・torso回転）は一切変更しない。
2. **ロール・チーム戦術の整理と追加実装** — 現状 `OffenseRoleAssignment`（5 固定ロール）と `LeagueTeam.defenseScheme`（DROP/SWITCH/ZONE）が別階層に散在。整理して一元化した上で、DefenseScheme の実適用とオフェンスセットプレー（ピック&ロール / モーション / ホーンズ等）を追加する。
3. **オフボール AI 強化** — カッティング・バックドア・リロケート・スクリーン外し・スペーシング維持・オフボールスクリーン・リバウンドポジショニング の全要素を実装する。
4. **アニメーション種類の追加** — 現状の手続き的アニメーション仕様を維持しつつ、追加モーション（クロスオーバー、スピン、ユーロステップ、ハンドオフ、スクリーン、カット等）を実装する。

## 設計方針

### ボクセル Body 置換の方針（方針 A-1: 集約マッピング）

既存の `game-assets` は Mixamo 相当の細粒度（腕だけで shoulder + arm_stretch + arm_twist×2 + forearm_stretch + forearm_twist×2 + hand = 8 パーツ）。basketball-game の関節構造は粗粒度（肩→肘→手首の 2 関節、膝なし）。両者のギャップを「集約マッピング」で吸収する:

| basketball-game 側の論理パーツ | game-assets の集約元パーツ |
|--------------------------------|----------------------------|
| Head                           | `head.x + neck.x + jawbone.x + c_eye.l/r + c_ear_01/02.l/r` |
| Torso（上半身）                | `c_spine_01/02/03_bend.x + breast.l/r` |
| Hips（腰）                     | `c_root_bend.x` |
| UpperArm.l / .r                | `shoulder.{l/r} + c_arm_stretch.{l/r} + c_arm_twist.{l/r} + c_arm_twist_2.{l/r}` |
| Forearm.l / .r                 | `c_forearm_stretch.{l/r} + c_forearm_twist.{l/r} + c_forearm_twist_2.{l/r}` |
| Hand.l / .r                    | `hand.{l/r}` |
| Leg.l / .r（脚 1 本）          | `c_thigh_stretch.{l/r} + c_thigh_twist.{l/r} + c_thigh_twist_2.{l/r} + c_leg_stretch.{l/r} + c_leg_twist.{l/r} + c_leg_twist_2.{l/r}` |
| Foot.l / .r                    | `foot.{l/r}` |

集約する際はローカル原点を論理パーツの親関節位置に揃える（例: UpperArm.l は shoulder 位置が原点）。

### アセット配信（方針 C-1: API 経由）

`basketball-game/src/app/api/vox-assets/[...path]/route.ts` を新設し、`C:\Users\user\developsecond\game-assets\vox` 下の任意ファイル（`.vox` / `.json`）を配信する。環境変数 `VOX_BASE_DIR` で上書き可。パストラバーサル対策として `path.resolve` で `VOX_BASE` 配下に閉じ込める。

既存の `VoxHeadMesh.ts` が参照する `/box/head.vox` は `public/` 不在で失敗しているため（Phase 0 で検証）、新 API への移行で解決させる。

### モーション互換性の維持

`ArmRenderer` / `LegRenderer` の IK・肘ヒント・リーチ・歩行振り・torso 回転等の**動きの制御は一切変更しない**。プリミティブを生成している箇所（`MeshBuilder.CreateCylinder` 等）だけを、`VoxLoader` が返す `Mesh` に差し替える。上腕・前腕・脚の「長さ」は現状コード側でスケーリングされているので、集約 .vox もその論理長に合わせてスケールする（`body_metrics.json` の `bone_length` を参照）。

---

## Phase 0: 基盤整備 (vox 配信 + 汎用ローダー)

**目標:** `.vox` パーツを取得・合成できる基盤を用意する。視覚確認はまだ行わない。

### 0.1 vox アセット配信 API

- `src/app/api/vox-assets/[...path]/route.ts` を新設
- `GET /api/vox-assets/female/female_164cm/parts.json` → JSON 配信
- `GET /api/vox-assets/female/female_164cm/segments/head.x.vox` → binary 配信
- `VOX_BASE_DIR` 環境変数（デフォルト `C:\Users\user\developsecond\game-assets\vox`）
- パストラバーサル対策（`resolve` 後の prefix チェック）
- Content-Type: `.vox` → `application/octet-stream`、`.json` → `application/json`

### 0.2 汎用 VoxLoader

- `src/GamePlay/Object/Entities/VoxLoader.ts` を新設
- `voxel-map/src/lib/vox-parser.ts` をベースに以下を実装:
  - `parseVox(buffer): VoxModel` — 既存 `VoxHeadMesh.ts` 内のパーサーを外出し
  - `buildMeshFromVoxels(voxels, palette, scene, opts)` — 露出面カリング + 軸リマップ
  - `loadVoxFile(url)` — fetch + parse
  - `mergeVoxParts(parts, scene, opts)` — 複数 .vox を 1 メッシュに集約（voxels 結合 + 共通パレット統一）
- 軸リマップ・SCALE は既存 `VoxHeadMesh.ts` の規約を踏襲（vox X→localX, vox Z→localY, vox -Y→localZ, SCALE=0.010）

### 0.3 parts.json / body_metrics.json の型と読み込み

- `src/GamePlay/Object/Entities/VoxCharacterTypes.ts` に型定義（`PartEntry` `BodyMetric` 等）
- `loadVoxCharacter(gender, name)` — parts.json + body_metrics.json をまとめて取得

### 0.4 現状 head 描画の動作確認

- `yarn dev` で `/character-move-1on1` を起動し、現状 `/box/head.vox` が描画されているか目視
- 描画されていなければ `SimVisualization.loadAndAttachHeads` を新 VoxLoader + API 経由に切り替え（一時的に `female_164cm/segments/head.x.vox` を参照）

**完了条件:** ブラウザの Network タブで `/api/vox-assets/female/female_164cm/parts.json` が 200 を返す。`VoxLoader.loadVoxFile` が単体で 1 パーツを描画できる。

---

## Phase 1: キャラクター Body 実装

**目標:** 現状のプリミティブ合成を全てボクセルメッシュに置き換える。動きは現状維持。

### 1.1 CharacterPartSet 型と解決

- `src/GamePlay/Game/Visualization/CharacterPartSet.ts`
  - `CharacterPartSet` 型（`head: string; torso: string; hips: string; upperArmL/R; forearmL/R; handL/R; legL/R; footL/R` の論理パーツ名集合）
  - デフォルトセット（female_164cm からの集約マッピング定義）

### 1.2 CharacterBody クラス

- `src/GamePlay/Game/Visualization/CharacterBody.ts`
  - `loadParts(partSet, scene)` — 各論理パーツを非同期でロードし `Record<部位, Mesh>` を返す
  - 論理パーツごとに game-assets の複数 .vox を集約 (`VoxLoader.mergeVoxParts`)
  - 各パーツのローカル原点を関節位置に揃えるオフセット計算（`body_metrics.json` の `head` 座標を使用）

### 1.3 SimVisualization.createOctEntity の置き換え

- 上半身 Cylinder (`upper`) → Torso メッシュ
- hipBox (`LegRenderer.createLegs` 内) → Hips メッシュ
- 既存の親子関係（root → hipBox, root → pivot → upper + arms）は完全維持
- 上半身の torso 回転ピボット・脚の hipJoint TransformNode は不変

### 1.4 ArmRenderer のメッシュ差し替え

- `createArms` 内の `CreateCylinder(upperArm)` / `CreateSphere(elbow)` / `CreateCylinder(forearm)` / `CreateSphere(hand)` を VoxLoader 由来のメッシュに置き換え
- IK 計算結果（肩位置・肘位置・手位置）へのメッシュ配置ロジックは維持
- ただしボクセルは固定形状のため、現状コード側で腕長をスケーリングしている箇所は「論理長に対する .vox 実測長の比」で scale.y を決める
- 肘球は game-assets に該当パーツがないため、当面非表示 or shoulder パーツに吸収

### 1.5 LegRenderer のメッシュ差し替え

- `createLegs` 内の `CreateBox(hipBox)` / `CreateCylinder(leg)` / `CreateBox(foot)` をボクセルに置き換え
- 膝関節なし（既存構造維持）、脚は `c_thigh_* + c_leg_*` を集約した 1 本メッシュとして配置

### 1.6 VoxHeadMesh の整理

- `VoxHeadMesh.ts` を非推奨化（互換性ラッパーとして残し、内部で `VoxLoader` を呼ぶ）
- `SimVisualization.loadAndAttachHeads` を `CharacterBody.loadHead` に置き換え

**完了条件:** `/character-move-1on1` で 10 体のキャラクターがボクセルボディで描画される。走行・ドリブル・パス・シュート・ブロック各モーションが現状と同じに見える。

---

## Phase 2: ロール・チーム戦術レイヤーの整理

**目標:** 散在するロール定義を一元化し、DefenseScheme を実適用、オフェンスセットプレーを追加する。

### 2.1 ロール定義の一元化

- 現状二重定義の整理:
  - `SimulationPlay/Management/League/Types.ts` — `OffenseRole / DefenseRole / DefenseScheme` (enum)
  - `GamePlay/Game/Decision/OffenseRoleAssignment.ts` — `SimOffenseRole` (type), `ROLE_ASSIGNMENTS`
- どちらを正とするか決め、TrackingSimulation3D は LeagueTeam の role 定義を受け取って動く構造にする
- `LeagueTeam.players[].offenseRole` を TrackingSimulation3D に流し込む入口を作る

### 2.2 DefenseScheme の実適用

- `GamePlay/Game/Update/ObstacleDefenseAI.ts` に DROP/SWITCH/ZONE の分岐を追加
  - **DROP** — スクリーンに対してハンドラーから離れてゴール方向へドロップ
  - **SWITCH** — スクリーン時に対象を入れ替え
  - **ZONE** — マンツーマンではなくエリア担当（3-2 or 2-3）
- 現状のオンボール / POA / NAIL / CLOSEOUT / LOW_MAN / SCRAMBLER のディフェンスロールも再確認して明文化

### 2.3 オフェンスセットプレー

- `src/GamePlay/Game/Scheme/` ディレクトリ新設
  - `SchemeBase.ts` — スキーム共通インタフェース（`tick(state, dt)` で各プレイヤーに目的地を配る）
  - `PickAndRollScheme.ts`
  - `MotionOffenseScheme.ts`
  - `HornsScheme.ts`
  - `SpreadScheme.ts`
- LeagueTeam に `offenseScheme` フィールドを追加
- TrackingSimulation3D がシーンごとにスキームを切り替える（ショットクロックリセットで再抽選など）

### 2.4 トランジション攻防

- 速攻・セットオフェンスの切替条件を整理（`offenseInTransit` 既存フラグを活用）

**完了条件:** チーム設定で DefenseScheme を切り替えると挙動が変わる。オフェンスセットプレーが少なくとも 2 種類動く。

---

## Phase 3: オフボール AI 強化

**目標:** オフボール時の判断を 6 要素すべて実装する。

### 3.1 カッティング（バックドア含む）

- `src/GamePlay/Game/Decision/Cut.ts`
- ディフェンダーの視線・位置からバックドア成立条件を判定
- 既存 `SlasherState.vcutPhase` と整合させる

### 3.2 リロケート

- ボールハンドラードライブ時に逆サイドへドリフト
- 現状 `OpenSpaceFinder` を活用

### 3.3 スクリーン外し

- オフボールスクリーンを受ける側の判断
- カーラ / フェア / リジェクト の選択

### 3.4 スペーシング維持

- 4 アウト-1 イン / 5 アウト のフォーメーション維持
- `FieldPositionScorer` を拡張

### 3.5 オフボールスクリーン

- ピンダウン / フレア / クロススクリーン / ステアステップ の実装
- `SCREENER_OFFSET` 等の既存定数を活用

### 3.6 リバウンドポジショニング

- シュート飛翔中のリバウンドポジションアサイン
- オフェンスリバウンド（inside position 確保） / ディフェンスリバウンド（ボックスアウト）

**完了条件:** 各要素がトグル可能で、有効化すると挙動差が目視確認できる。

---

## Phase 4: 追加モーション

**目標:** 現状の手続き的アニメーションロジックを維持しつつ種類を拡充する。

### 候補

- **オンボール:** クロスオーバー、スピン、ヘジテーション、ユーロステップ、ステップバック、ハンドオフ
- **オフボール:** シャープカット、バックカット、Lカット、スクリーンインカット
- **ディフェンス:** クローズアウト、スワイプ、ディナイ
- **特殊:** ティップイン、プット バック、ルーズボールダイブ

各モーションは既存の `ArmLerpState` / `LegStepState` / `ActionState` を拡張して実装する。

**完了条件:** 優先度高のものから 5 種以上追加。

---

---

## Phase G: 試合進行ロジック（Phase 1〜4 と並行可能な独立トラック）

**目標:** バスケットボールの公式ルールに沿った試合進行ロジックを実装する。NBA ルール基準（12分×4Q、6ファウル退場、ボーナス5回目から）。

### Phase G.0: 設定修正（NBA 基準化）

**目標:** コート寸法・リム高・ボール径・身長基準を NBA 実規格に揃え、3P/2P 判定とペイント定義を一本化する。

- コート: 30m×15m → 28.65m×15.24m (94ft×50ft)
- リム高: 2.00m → 3.05m (10ft)
- ボール直径: 0.3m → 0.24m (size 7)
- 身長基準: 150cm → 200cm (`BASE_HEIGHT_CM`, `ENTITY_HEIGHT`)
- ゴール位置: ±13.4 → ±12.725 (rim center 1.575m from baseline)
- 3P ライン定数追加: `THREE_POINT_RADIUS=7.24`, `THREE_POINT_CORNER_HALF_X=6.71`
- ペイント定義一本化: `PAINT_HALF_WIDTH=2.44`, `PAINT_DEPTH=5.79`
- ヘルパー追加: `isThreePointShot()`, `getShotPointValue()`, `isInPaint()`

### Phase G.1: Tier 1 — 試合の枠

1. `GameClockManager` 新設 — 12分×4Q、OT 5分、一時停止
2. `ShotClockManager` 新設 — 24秒 / オフリバ14秒リセット、バイオレーション発火
3. **2P/3P 得点判別の組み込み** — シュート位置から `getShotPointValue` で加算
4. ハーフタイム・クォーター間処理（クロックリセット、ボール所有切替）
5. 試合終了判定 + 勝者決定（同点 → OT）

### Phase G.2: Tier 2 — 公式ルール

6. `FoulManager` — 個人ファウル/チームファウル/ボーナス、6 ファウル退場
7. `FreeThrowHandler` — シュートファウル時の FT 実行
8. アウトオブバウンズ宣言 + インバウンドプレー
9. バイオレーション（トラベリング、3秒、5秒、8秒、バックコート）
10. ゴールテンディング / バスケットインタフィアランス
11. ジャンプボール状況 + ポゼッションアロー

### Phase G.3: Tier 3 — 運営・統計

12. タイムアウト（NBA: 7回/試合）
13. 選手交代
14. ボックススコア（個人スタッツ: PTS/REB/AST/STL/BLK/TO/PF/FG/3P/FT）
15. プレイバイプレイログ
16. アシスト判定（直前パス→ゴール）

### 進行ルール

- 各 Phase G.x 完了でユーザー確認を取る
- 既存物理チューニング（ジャンプ高さ等）は触らない方針、必要な場合は再校正

---

## Phase H: 戦術・スキル深化 (戦術 + 個人スキル + バイオメカ + 判断基準)

**目的:** ユニットの「バスケットボール選手としての動き方」を、(1) 個人スキル、(2) チーム戦術、(3) ポジション役割、(4) 人体構造とその動きに基づいて深化させる。Phase 2 (ロール・戦術整理) と Phase 3 (オフボール AI) を含み込んだ大型再設計。

**ネットリサーチに基づく前提 (主ソース):**
- 個人スキル: [breakthroughbasketball.com](https://www.breakthroughbasketball.com/fundamentals/individual_offense.html), [coachesclipboard.net](https://www.coachesclipboard.net/OutsideMoves.html)
- バイオメカ: [SimpliFaster — Defense breakdown](https://simplifaster.com/articles/deconstructing-preformance-training-basketball-defense/), [PMC — GRF/COM during 180° COD](https://pmc.ncbi.nlm.nih.gov/articles/PMC12935448/), [Coach Dave Love — Stance widths](https://coachdavelove.com/quantifying-stability-in-basketball-the-science-behind-optimal-stance-widths/), [Physiopedia — Jump shot](https://www.physio-pedia.com/Biomechanics_of_the_Basketball_Jump_Shot)
- 視野: [Australia Basketball — Scanning](https://www.australia.basketball/news/4097014/the-art-of-scanning-enhancing-basketball-iq-through-better-awareness), [Nature — Viewing angle response time](https://www.nature.com/articles/s41598-024-53706-9), [Basketball Immersion — Scanning](https://basketballimmersion.com/scanning-and-cognitive-load-basketball-mastery/)
- 5-Out モーション: [breakthroughbasketball.com — 5-Out](https://www.breakthroughbasketball.com/offense/five-out-basketball-offense.html), [basketballforcoaches.com](https://www.basketballforcoaches.com/5-out-motion-offense/)
- ホーンズ / Spain: [coachesclipboard.net — Horns](https://www.coachesclipboard.net/HornsOffense.html), [bballplaybook.com — Spain PnR](https://www.bballplaybook.com/basketball-offense/spain-pick-and-roll-breaking-down-the-modern-twist)
- PnR Defense: [breakthroughbasketball.com — Coverages](https://www.breakthroughbasketball.com/fundamentals/defending-pick-and-roll-coverages), [pickandpop.net](https://www.pickandpop.net/pick-and-roll-coverages-explained-without-jargon-drop-hedge-switch/)
- Pack Line Defense: [basketballforcoaches.com — Pack Line](https://www.basketballforcoaches.com/pack-line-defense/), [coachesclipboard.net](https://www.coachesclipboard.net/BasketballPackLineDefense.html)
- ポジション: [Wikipedia — Basketball positions](https://en.wikipedia.org/wiki/Basketball_positions)
- クローズアウト: [breakthroughbasketball.com — Closeout keys](https://www.breakthroughbasketball.com/defense/keys-close-outs.html), [Hooper University](https://www.hooperuniversity.com/breakdowns/the-right-way-to-closeout-and-contest)
- トランジション: [coachesclipboard.net — Transition Defense](https://www.coachesclipboard.net/TransitionDefense.html)
- カット: [breakthroughbasketball.com — Cutting](https://www.breakthroughbasketball.com/offense/the-importance-of-cutting)

### リサーチ要点 (実装すべきモデルの根拠)

#### 1. 人体動作の基本パラメータ

- **重心 (Center of Mass)**: スタンス幅 1.0–1.5×腰幅 が最適、COM は base of support 内に。前足体重 50%以上、踵接地は維持。
- **ディフェンシブスライド**: 押す側の脚 + 反対脚の外旋でエネルギー伝達。両足が交差せず、肩幅維持。
- **第一歩 (First Step)**: 水平 GRF が支配的、ハムストリング + 大腿四頭 + 殿筋。低重心からの押し出し → 加速 → 最高速の3フェーズ。
- **視野**: 80% は周辺視野で取得。スキャンは「ボール受け前 / 受けた瞬間 / 受けた後」の3タイミング。視野角 90° 以上で熟練者の反応時間が初心者を上回る。
- **ジャンプ**: 足首・膝・股関節の連動 (triple extension)。SSC (stretch-shortening cycle)。

#### 2. 個人オフェンスの判断

- **トリプルスレット**: shoot / pass / dribble の3択。実は同時には1つしか「脅威」にならず、シューティング脅威を最優先する設計が現代主流。
- **ドリブルムーブ発火条件**:
  - クロスオーバー: ディフェンダーが片足体重に偏った瞬間
  - ヘジテーション: ディフェンダーが下がり始めた瞬間
  - ステップバック: ディフェンダーが前のめりになった瞬間
  - ユーロステップ: ペイント内・ディフェンダー間を抜ける時
- **オフボールカット**:
  - **V カット**: ディフェンダーを後退させてから急反転
  - **L カット**: ペイントから外へ、または逆
  - **バックドア**: ディフェンダーがオーバープレイ (高い位置で deny) なら裏へ
  - **フレア**: スクリーン後にコーナー方向へ広がる
  - **ピンダウン**: 下から上に向かう (リング側 → 外)

#### 3. 個人ディフェンスの判断

- **オンボール**: アームレングス間合い、相手のヘソを見る、両手アクティブ。
- **クローズアウト**: 距離 ≈3m で sprint → choppy steps への切替。「sprint stop closeout」(片足ハイハンド) も現代主流。ハイハンドはシュート抑止、ローハンドはドライブ対応。
- **オフボール**: Ball-You-Man 三角形。デナイ vs ヘルプポジションの判断は (ボールから 1パス先か / 2パス先か)。
- **スクリーン対応**: over / under / through / switch を、相手のシュート力 + 自分のサイズ + 残時間で決定。

#### 4. チームオフェンスシステム

- **5-Out モーション (5 つのルール)**:
  1. デナイされたらバックドア
  2. アタック可能なら即攻め
  3. ボール受けたら必ずスクエアアップ
  4. すべての行動に目的を
  5. パス・カット・ドリブル後はサークルローテーションでフィル
- **ピック&ロール バリエーション**:
  - High PnR (トップ)、Side PnR (ウィング)、Drag PnR (トランジション中)
  - **Spain PnR**: スクリーナーのディフェンダーに第三者がバックスクリーン → 3 vs 2 構造
  - **Twist**: ホーンズから 1-5 PnR への発展、フレアと組み合わせ
- **DHO (Dribble Hand-Off)**: ドリブルしながら手渡し、トランジション → 即 PnR 移行可能。
- **スペーシング原則**: 3P ライン後ろに 2-3ft、各ポジションのホームスポット (コーナー / ウィング / トップ)。

#### 5. チームディフェンス

- **Pack Line**: ヘルプ全員が 16ft ライン (3P アーク内側) に縮む。ドリブル侵入阻止。
- **ヘルプ・ザ・ヘルパー**: ヘルプに出た選手のホームを次のヘルパーが埋める、を連鎖。
- **PnR カバレッジ**: Drop (3P 許容、リム保護)、Hedge/Show (一時圧)、Switch、Blitz、Ice (サイドへ追い込む)、Weak (反対側へ)。
- **トランジションディフェンス**:
  1. ボール止め (最も近い人)
  2. ベースライン到達 (最低 1 人がリム下)
  3. 残りはマッチアップ
  4. 「2 vs 1 では絶対レイアップ阻止」

#### 6. ポジション役割 (現代化込み)

| Pos | 攻撃 | 守備 | 現代変種 |
|---|---|---|---|
| 1 PG | テンポ管理、PnR 主導 | オンボール圧、リードラン解消 | Combo Guard (PG+SG) |
| 2 SG | コーナー 3P、オフボールスクリーン受け、カット | ウィング守備 | (役割重複) |
| 3 SF | アイソ、ウィングドライブ、トランジション | マルチポジション守備 | Point Forward (SF+PG playmaking) |
| 4 PF | スクリーナー、ロール、ピックアンドポップ、OREB | ヘルプ、スイッチ可能性 | Stretch 4 (3P射撃) |
| 5 C | リム周り、スクリーナー、DUO センター | リムプロテクト、PnR Drop、DREB | Small Ball 5 (機動力) |

**個人 vs チーム戦術の切替**:
- セットプレー実行中: チーム支配
- ショットクロック残り <6 秒、アイソ指定、ミスマッチ発生: 個人支配
- 切替は「個人効率 vs チーム効率」を毎ポゼッション評価

---

### 実装ロードマップ

#### Phase H.1: 人体動作の基盤レイヤー

**目的:** Phase H 全体の前提となる身体パラメータをモデル化。

- **H.1.1 重心 (Center of Mass) の明示モデル化**
  - `SimMover` に `comY` (重心高さ) と `stanceWidth` (スタンス幅) を追加
  - スタンス幅 = 1.2 × hipWidth (scale 連動)、COM Y = bodyHeight × 0.55
  - 移動・減速時に COM がスタンス内に収まるかを判定 (はみ出すと体勢崩れ)
- **H.1.2 視野 (FOV) システム拡張**
  - 既存 `FOV_NARROW_DIST` を 中心視野 (60°) と 周辺視野 (180°) に分割
  - スキャン状態 (`scanState: 'pre-catch' | 'on-catch' | 'post-catch'`) を `SimMover` に追加
  - 視認情報のキャッシュ (一度視野に入ったら 2 秒間「既知」扱い)
- **H.1.3 加減速の 3 フェーズモデル**
  - `MovementCore.ts` を拡張: `acceleration / sprint / deceleration` の各フェーズで加速度を変える
  - 第一歩 (静止から 0.2 秒以内) は爆発力係数 (`firstStepBoost = 1.4`) を乗じる
  - 減速時は COM 後傾、スライド距離あり
- **H.1.4 トリプルスレットの意思決定 (Refactor)**
  - 既存 `ActionScorer` を拡張: shoot/pass/drive の3択スコアを、(ディフェンダー距離 × 自分のシュート確率 × 味方フリー度 × ショットクロック) で重み付け
  - 「シュート脅威優先」の現代理論を実装

**完了条件:** COM が可視化される、視野範囲が可視化される、第一歩が体感できる速さで動く。

#### Phase H.2: 個人スキルライブラリ

**目的:** 個人プレイヤーの「ムーブ」を技術カタログ化し、状況依存で発火させる。

- **H.2.1 ドリブルムーブライブラリ**
  - `Game/Skills/Dribble/` 配下に各ムーブを実装:
    - `Crossover.ts`: ディフェンダーの体重が片足偏ったとき発火
    - `Hesitation.ts`: ディフェンダーが下がり始めたとき
    - `StepBack.ts`: ディフェンダーが前進したとき、シュート脅威化
    - `InAndOut.ts`: ディフェンダーをハーフコミットさせる
    - `Spin.ts`: ペイント手前、ディフェンダーが体を寄せたとき
    - `Eurostep.ts`: ペイント内、複数ディフェンダー間で
  - 各ムーブは "trigger condition + animation override + outcome" の構造
- **H.2.2 フィニッシュ技術**
  - 既存 dunk/layup/jumpshot に追加:
    - `Floater.ts`: ペイント手前、長身ディフェンダー越し
    - `ReverseLayup.ts`: ヘルプディフェンダーが追ってきたとき
    - `HookShot.ts`: ポストプレイヤー、リム背中向き
  - シュート種別の選択を `getFinishType(shooter, defenders)` で動的決定
- **H.2.3 オフボールカット (workPlan Phase 3.1 と統合)**
  - `Game/Skills/Cuts/` 配下に:
    - `VCut.ts` (既存 `SlasherState.vcutPhase` から拡張)
    - `LCut.ts`
    - `BackdoorCut.ts` (ディフェンダーが overplay/deny で発火)
    - `FlareCut.ts`
    - `ShallowCut.ts`
  - パス受け前後でカット種別を切替
- **H.2.4 フットワーク**
  - ピボット (フロント / リバース)、ジャンプストップ、ストライドストップ、ドロップステップ
  - トラベリング判定 (Phase G.2 では未実装) のための足の状態追跡

**完了条件:** 試合中に各ムーブ・カット・フィニッシュが状況に応じて発火し、視覚的に区別できる。

#### Phase H.3: チーム戦術システム (workPlan Phase 2.3 と統合)

**目的:** チーム単位のオフェンス・ディフェンスシステムを実装。

- **H.3.1 モーションオフェンス**
  - `Game/Scheme/MotionOffense/`
    - `FiveOut.ts`: 5 ルール (バックドア / アタック / スクエアアップ / 目的 / フィル) を実装
    - `FourOutOneIn.ts`: ハイ/ロー ポスト連携
  - 各プレイヤーが現在のロール (cutter / replacer / spacer) を状況で切替
- **H.3.2 セットプレー** (workPlan Phase 2.3 そのもの)
  - `PickAndRoll/`:
    - `HighPnR.ts`, `SidePnR.ts`, `DragPnR.ts`
    - `SpainPnR.ts` (third screener 含む 3 人連携)
    - `Twist.ts` (Horns からの 1-5 PnR)
  - `Horns/`: `HornsFlare.ts`, `HornsTwist.ts`, `HornsDown.ts`
  - `Flex/`: フレックススクリーン + ダウンスクリーン
  - `DHO.ts`: ドリブル手渡し
- **H.3.3 ディフェンススキーム** (workPlan Phase 2.2 と統合)
  - `Game/Defense/Schemes/`:
    - `ManToMan.ts` (基本)
    - `PackLine.ts` (16ft 線で縮む)
    - `NoMiddle.ts`
  - `PnRCoverage/`: `Drop.ts`, `Hedge.ts`, `Switch.ts`, `Blitz.ts`, `Ice.ts`, `Weak.ts`
  - `ZoneDefense/`: `Zone23.ts`, `Zone32.ts`, `Zone131.ts`
- **H.3.4 トランジション**
  - 既存 `offenseInTransit` を拡張:
    - **攻撃側**: プライマリーブレイク (3 レーン)、セカンダリーブレイク
    - **守備側**: stop ball → sprint baseline → match up (優先順位ベース)
  - リバウンド成功 → 速攻判定 (オフェンス選手の数 vs ディフェンス選手の数 + 残時間)

**完了条件:** チーム戦術切替で挙動が変わる、PnR coverage 切替で守備行動が変わる、速攻が成立する。

#### Phase H.4: 個人 vs チーム戦術の統合とポジション現代化

**目的:** 戦術プライオリティ・モデル、現代ポジションレス、個性化を統合。

- **H.4.1 戦術プライオリティ・マネージャ**
  - 毎ポゼッション、`TacticalPriority` を評価:
    - `team` (セットプレー実行中、ショットクロック >12s)
    - `individual` (アイソ指定、ショットクロック <6s、ミスマッチ判定)
    - `transition` (リバウンド直後、ターンオーバー直後)
  - 各プレイヤーが優先度に応じて意思決定モードを切替
- **H.4.2 現代ポジションレス対応**
  - ロール定義を `OffenseRoleAssignment.ts` から拡張:
    - `ComboGuard` (PG+SG)、`PointForward` (SF+PG)、`Stretch4` (PF + 3P)、`SmallBall5` (機動力)
  - LeagueTeam の選手能力値 (`PlayerData.ts`) からロールを動的に推論
- **H.4.3 ファジー判断基準**
  - 距離・体重・スピード・ファウル数・残時間・スコアを加味した重み付け関数群を `Decision/Weights.ts` に集約
  - 各判断が単一ルールではなく加重和で決まる構造に
- **H.4.4 個性化 (能力値反映)**
  - `PlayerData` の offense / defense / speed / IQ を各判断のパラメータに掛ける
  - 例: shoot 判定 = base_score × (offense_skill / 50)、reaction_time = base_time / (IQ / 50)

**完了条件:** 異なるロール / 能力値の選手が異なる動きをする。同じシチュエーションでも個性が出る。

---

### Phase H 全体の進行順序と前提

| 順序 | Phase | 前提 |
|---|---|---|
| 1 | H.1 (人体動作基盤) | 既存 Phase G.0-G.3 (試合進行) 完了 |
| 2 | H.2 (個人スキル) | H.1 完了 |
| 3 | H.3 (チーム戦術) | H.2 と並行可、ただし H.1 完了後 |
| 4 | H.4 (統合) | H.1-H.3 完了 |

### 規模感

- H.1: 1〜2 週間 (4 サブフェーズ)
- H.2: 3〜4 週間 (4 サブフェーズ × 多数ムーブ)
- H.3: 4〜6 週間 (4 サブフェーズ × 多数システム)
- H.4: 2〜3 週間 (4 サブフェーズ)
- **合計: 10〜15 週間 (集中作業ベース)**

Phase 1 (ボクセル化) と Phase H は独立して進められる。 Phase 2/3 (既存の戦術整理) は Phase H.3 に吸収統合される。

---

## 将来的な計画（スコープ外、設計時考慮）

- **3D 試合とシーズンモードの接続** — 現在 `SimulationPlay/Season/SeasonHome.handlePlay` は TODO で SIM 代用。将来 `/league/match` と同様に `/season/match` 経由で TrackingSimulation3D に遷移させる。
- **選手能力値の反映** — `GamePlay/Data/Types/PlayerData.ts` にある各能力値（offense / defense / speed 等）を TrackingSimulation3D のパラメータに反映する。
- **リプレイ記録** — 試合イベントの保存・再生。

---

## 進行ルール

- **Phase 単位でユーザー確認を取る** — 各 Phase 完了時に報告・承認後に次 Phase に着手。
- **`work-record.md` に日次記録を残す** — 日付・実施項目・成果物・気付きを簡潔に。
- **再修正指示を受けたら前回変更をリバート** — グローバルルール `feedback_work_process.md` に従う。
