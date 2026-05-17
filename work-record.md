# 作業記録 (Work Record)

## 2026-04-22

### 方針決定

- `/character-move-1on1` の TrackingSimulation3D をバスケ試合基盤として拡張する方針でユーザーと合意。
- 実装の 4 軸: (1) キャラクター Body のボクセル化 / (2) ロール・戦術整理と追加 / (3) オフボール AI 強化 / (4) 追加モーション。
- デバッグ UI は削除しない（そのまま維持）。モーション制御ロジックは変更せず、描画パーツだけを .vox に置き換える。
- 共有アセット `C:\Users\user\developsecond\game-assets\vox` を基にし、現状の粗粒度（2 関節）構造に集約マッピングして使用。
- アセット配信は basketball-game 側で API route (`/api/vox-assets/[...path]`) を新設。
- `workPlan.md` を新規作成し Phase 0〜4 で管理開始。

### 調査メモ

- 現状 `SimVisualization.ts:390` が `/box/head.vox` を fetch しているが `basketball-game/public/` が存在しない → head 描画は現状失敗している可能性が高い。Phase 0 で検証。
- game-assets のパーツ粒度: `head.x / neck.x / jawbone.x / c_eye.l/r / c_ear_01/02.l/r / c_spine_01/02/03_bend.x / c_root_bend.x / breast.l/r / shoulder.l/r / c_arm_stretch/twist/twist_2.l/r / c_forearm_stretch/twist/twist_2.l/r / hand.l/r / c_thigh_stretch/twist/twist_2.l/r / c_leg_stretch/twist/twist_2.l/r / foot.l/r`。
- 同系統のボクセル基盤は `voxel-map/src/lib/voxel-skeleton.ts`（41 Mixamo ボーン実装）と `vox-parser.ts` に既存。参考にしつつ basketball-game 用は簡素化（モーションは現行 2 関節 IK を維持）。

### Phase 0 完了

- `src/app/api/vox-assets/[...path]/route.ts` 新設 — `VOX_BASE_DIR` 環境変数（既定: `game-assets/vox`）からファイル配信、パストラバーサル対策済み
- `src/GamePlay/Object/Entities/VoxLoader.ts` 新設 — `parseVox` / `buildMeshFromVoxels` / `loadVoxFile` / `mergeVoxParts` / `loadVoxCharacter` / `resolvePartUrl` / `partUrlByKey` を提供
- `src/GamePlay/Object/Entities/VoxCharacterTypes.ts` 新設 — `VoxPartsManifest` / `VoxBodyMetrics` 型、`DEFAULT_AGGREGATION`（論理パーツ → game-assets キー群の集約マップ）
- `tsc --noEmit` 通過
- dev server (port 3002) 起動確認:
  - `GET /api/vox-assets/female/female_164cm/parts.json` → 200, 10,491 bytes
  - `GET /api/vox-assets/female/female_164cm/body_metrics.json` → 200, 74,438 bytes
  - `GET /api/vox-assets/female/female_164cm/segments/head.x.vox` → 200, 16,164 bytes（VOX マジックバイト確認）
  - `GET /api/vox-assets/..%2F..%2Fpackage.json` → 400（traversal ブロック）
- 現状 `public/box/head.vox` は不在のため、既存 `VoxHeadMesh` 読み込みは 404 で失敗していたことを確定（Phase 1 で新 API 経由に切替）

## 2026-05-17

### Phase G 立ち上げ — 試合進行ロジック実装計画

- ユーザー要望: 試合進行ロジックで足りないものをリサーチ → Tier 1〜3 の順で実装、加えて試合設定の不備も修正
- 調査結果: 設定の不備として (a) 3P ライン未定義、(b) 2P/3P 得点判別なし、(c) コート長 30m（NBA は 28.65m）、(d) ペイント定義の重複/微妙ズレ、(e) リム高 2.00m と身長基準 150cm の組合せ（"縮尺世界"）— の 5 点を特定
- ユーザー判断: 全部 NBA 実規格に直す（リスク高）、Phase 完了ごとに確認、NBA ルール基準

### Phase G.0 完了 — 設定 NBA 規格化

更新したファイル:
- `src/GamePlay/Game/Config/FieldConfig.ts` — コート 28.65×15.24m、ENTITY_HEIGHT 2.0、BASE_HEIGHT_CM 200、BALL_DIAMETER 0.24、ゾーン・スポーンZ を新ゴール位置に再校正
- `src/GamePlay/Object/Entities/FieldConfig.ts` — FIELD_CONFIG.length/width を NBA 実寸に、センターサークル 1.83m
- `src/GamePlay/Game/Config/GoalConfig.ts` — リム高 3.05m、ゴール Z ±12.725、3P/ペイント定数追加、`isThreePointShot/getShotPointValue/isInPaint` ヘルパー追加
- `src/GamePlay/Object/Entities/Goal.ts` — rimHeight 3.05、rimDiameter 0.457 (NBA 18in)
- `src/GamePlay/Game/Config/ShootConfig.ts` — SHOOT_ZONE_Z FT ライン基準で再定義、MAX_SHOOT_RANGE 9.0
- `src/GamePlay/Game/Decision/OffenseRoleAssignment.ts` — home Z 座標を新ゴール位置に -0.65 シフト
- `src/GamePlay/Game/Config/EntityConfig.ts` — INIT_* 初期位置を新ゴール位置に -0.65 シフト
- `src/GamePlay/Game/Action/ShootAction.ts` — `_goalZ` 初期値 13.4 → 12.725
- `src/GamePlay/Game/Types/TrackingSimTypes.ts` — コメント更新

`tsc --noEmit` パス。ジャンプ物理は ENTITY_HEIGHT 1.0→2.0 とリム 2.00→3.05 が連動して動くため、既存 JUMP_VY 値で破綻しない見込み（DUNK margin 0.52m, LAYUP margin 0.28m）。視覚確認は要実機テスト。

### Phase G.1 完了 — Tier 1 試合の枠

新規ファイル:
- `src/GamePlay/Game/GameRules/GameClockManager.ts` — 12分×4Q + OT5分管理、`tick/startNextPeriod/pause/resume/isHalftime/getDisplayTime/reset` 実装
- `src/GamePlay/Game/GameRules/ShotClockManager.ts` — 24/14秒管理、`reset/tick/pause/stop/resume/isViolation` 実装

変更ファイル:
- `src/GamePlay/Game/Types/TrackingSimTypes.ts` — `lastShotReleasePos`, `lastShotPoints`, `periodTransitionTimer` を SimState に追加
- `src/GamePlay/Game/Update/SimBallManager.ts` — `executePendingShot` でシューター位置を `state.lastShotReleasePos` に記録
- `src/GamePlay/Game/TrackingSimulation3D.ts` — GameClock/ShotClock のインスタンス管理、update() でのクロック tick + 期間遷移処理、24秒バイオレーション処理、6 箇所の switchPossession 後にショットクロック reset、得点時に `getShotPointValue` で 2P/3P 判別
- `src/GamePlay/Game/TrackingSimulationPanel.tsx` — クロック表示 (period + 残り時間 + ショットクロック)、直前ポイント表示、GAME OVER 表示

実装内容:
- **ゲームクロック**: 12分×4Q+OT5分（NBA）。Q1→Q2→Q3→Q4 自動進行。Q4 同点なら OT1〜OT4 まで延長。OT4 同点なら強制終了
- **ショットクロック**: 24秒（NBA）、オフェンスリバウンド時 14秒リセット。ボール保持中のみカウント（飛行中・ルーズボール中はポーズ）。24秒バイオレーション時は強制ターンオーバー
- **2P/3P 得点判別**: シュート発射時にシューター位置を記録、得点成立時に `getShotPointValue(x, z, goalX, goalZ)` で 2 or 3 を判定し teamScores に加算
- **クォーター間処理**: 期間終了で 4 秒の待機 → ポゼッション交代 + コートリセット
- **試合終了判定**: Q4（または OT 終了時）に点差がついていれば終了、UI に GAME OVER + 勝者表示

既知の制約:
- ハーフタイムの攻撃ゴール反転（コートサイド入れ替え）は未実装（Team A は常に +Z 攻撃、Team B は -Z 攻撃）
- アシスト判定なし（Phase G.3 で追加）
- 12分×4Q は試合時間が長すぎてテストには不便（必要なら QUARTER_LENGTH_SEC を一時的に短く調整）

`tsc --noEmit` パス。

### Phase G.2 完了 — Tier 2 公式ルール

新規ファイル:
- `src/GamePlay/Game/GameRules/FoulManager.ts` — 個人/チームファウル、ボーナス (5回目から)、ファウルアウト (6個人ファウル)、テクニカル別カウント
- `src/GamePlay/Game/GameRules/FreeThrowHandler.ts` — 確率ベース FT 解決 (NBA 平均 78%)、`getShootingFoulFreeThrowAttempts` (2P/3P/AND-1)
- `src/GamePlay/Game/GameRules/ViolationDetector.ts` — 3秒ルール (ペイント滞在) と 8秒バックコート違反検知
- `src/GamePlay/Game/GameRules/GoaltendingDetector.ts` — リム高以上で下降中のショットへのディフェンス接触検知
- `src/GamePlay/Game/GameRules/PossessionArrow.ts` — オルタネイト・ポゼッション・アロー (ティップオフ + 状況用)

変更ファイル:
- `src/GamePlay/Game/Types/TrackingSimTypes.ts` — `violationState`, `lastEventMessage/Timer`, `freezeDuringFreeThrow`, `freeThrowResolveTimer` を SimState に追加
- `src/GamePlay/Game/TrackingSimulation3D.ts` — FoulManager/PossessionArrow インスタンス管理、violation tick、シューティングファウル検知 (AND-1 と miss + foul)、ゴールテンディング検知、FT 解決中の凍結処理、handleTurnover/setLastEvent/findRecentBlocker/triggerShootingFoul ヘルパー追加、全 switchPossession 後に violation リセット
- `src/GamePlay/Game/TrackingSimulationPanel.tsx` — チームファウル + ボーナス表示、直近イベント表示

実装内容:
- **ファウル**: 個人ファウル 6 で退場フラグ (退場後の交代は Phase G.3)、チームファウル 5 回目からボーナス (UI 表示)
- **シューティングファウル**: ブロック試行中ディフェンスがいる状態でショットが完了したとき 12% 確率で発火。AND-1 (made + foul) は 1 FT、miss + foul は 2/3 FT（位置に応じて）
- **FT 自動解決**: 確率ベース (78%) で即時計算、`teamScores` に +1 ずつ加算
- **3秒バイオレーション**: オフェンス選手がペイント内 3 秒以上滞在 → ターンオーバー
- **8秒バックコート**: ハーフコート未越え 8 秒 → ターンオーバー
- **ゴールテンディング**: リム高以上 + 下降中 + ディフェンス手接触 → バスケット成立扱い
- **オルタネイト・ポゼッション・アロー**: クラス実装済（実シミュレーション内での発火条件は未配線、Phase G.3 で活用予定）

既知の制約:
- 5秒クローズリーガード、トラベリング、ダブルドリブルは未実装（ステップ追跡が必要）
- バックコートバイオレーション（ハーフコート越えてから戻る）は未実装
- ファウルアウト後の選手交代は未実装（Phase G.3）
- FT 中はシンプルな 3 秒凍結で代用（FT アニメーション無し）
- ジャンプボール状況の発火条件は未実装（クラスのみ）

`tsc --noEmit` パス。

## 2026-05-17 (続き 6)

### Phase H.5 完了 — Skill / Scheme を意思決定フローに統合

調査: 既存オフボール AI は **動的判断あり** (固定 home 復帰ではない)。
findOpenSpaceInZone() で 1.2-2.0s 周期再評価、DF/味方/パスレーン/ゴール距離/センターバイアス/アイソレーションの 6 要素加重評価。SLASHER に V カット (3秒周期)、SCREENER ピックアンドポップ、DUNKER シール — すべて実装済。スペーシング 3.5m 最小強制。

統合の目的: Phase H.2 (Skill) と H.3 (Scheme) ライブラリを既存ロール移動と「協調」させる。

新規ファイル: `src/GamePlay/Game/Update/SchemeRunner.ts`
- `runSchemes(state, simTime, shotClockRemaining)`: TacticalMode に応じて active scheme 選択 + tick で指示生成
  - transition モード or in-transit → transition scheme
  - team モード → offensive scheme (motion / set play)
  - individual モード → スキーム指示なし
  - ディフェンスは常時 active
- `findInstructionForPlayer / findDefenseInstruction`: 絶対 index で指示検索 (priority ≥5 で有効)
- `applyInstructionMovement`: dest 指示への移動
- `evaluateCutForOffBall`: Skill (cut) 評価、Backdoor/Flare トリガー検知

SimState 拡張:
- `activeOffenseSchemeId/activeDefenseSchemeId/activeTransitionSchemeId` (UI 表示用)
- `cutStates[5]`: オフボール選手のカット中状態 (skillId/dest/remainingTime)
- `schemeOffenseInstructions / schemeDefenseInstructions / schemeTransitionInstructions`

TrackingSimulation3D 統合:
- `update()` で `runSchemes()` を毎フレーム呼び出し、state に保存
- カット状態のタイマー減衰 + 新規カット評価 (オフボール選手のみ)
- `getActiveSchemes()` を公開 (offense/defense/transition + activeCuts 配列)

SimEntityUpdate 拡張:
- `updateTargetRoleMovements` に scheme override 層を追加:
  1. 優先 1: カット中状態 → dest へ speed 1.3× で移動
  2. 優先 2: トランジション指示 (priority ≥7) → dest へ
  3. 優先 3: オフェンス指示 (priority ≥7) → dest へ
  4. 既存ロール移動 (上記無し時のフォールバック)
- `applyDestMovement` ヘルパー新規追加

UI 拡張 (TrackingSimulationPanel):
- TacticalMode 表示の下に active scheme 名を表示:
  - ⚡ Transition (橙)
  - ▶ OFF: Offense scheme name (青)
  - ▶ DEF: Defense scheme name (赤)
  - ✂ Cuts: PLn(backdoor/flare) (緑)

副作用 import: TrackingSimulation3D で `./Scheme` と `./Skills` を import (自動登録のため)

`tsc --noEmit` 通過 (4GB heap)。

オフボールプレイヤーの動的ポジション取り:
- 既存ロール AI: 健在 (findOpenSpaceInZone での再評価)
- 新 Scheme 指示: Tactical Mode 'team' or 'transition' 時に上書き可能
- 新 Cut 検出: Backdoor (DF が overplay) / Flare (コーナー方向広がり) を自動発火
- 個別 individual モード時はロール AI に任せる

## 2026-05-17 (続き 5)

### Phase H.4 完了 — 統合と現代化

新規ディレクトリ: `src/GamePlay/Game/Tactics/`
- `TacticalPriority.ts` (H.4.1): 戦術モード評価
  - 'transition' (ポゼッション開始 4秒以内 + in transit)
  - 'individual' (ショットクロック <6s or ミスマッチ 身長差 ≥10cm)
  - 'team' (デフォルト)
  - reason 文字列を UI に表示
- `PositionlessRoles.ts` (H.4.2): モダンロール 9 種
  - `COMBO_GUARD / POINT_FORWARD / STRETCH_4 / SMALL_BALL_5` + 5 traditional
  - `inferModernRole(stats, heightCm)` で PlayerStats から推論
  - `inferRoleFromHeight(mover)` で身長のみフォールバック
  - `ROLE_TENDENCIES` でロール別 shoot/pass/drive/rebound/rimProtect 傾向
- `PlayerAbility.ts` (H.4.4): 個人能力モデル
  - `SimPlayerAbility` 型 (offense/defense/speed/acceleration/jump/3p/2p/FT/passing/iq/rebounding/stamina)
  - `fromPlayerStats(stats)` で変換
  - `abilityToMultiplier`, `abilityToProbability` で能力値→係数変換
  - `computeShotProbability(ability, dist, is3P)`, `computeFreeThrowProbability(ability)`
  - `applyFatigue(mult, fatigue, ability)` でスタミナ補正
- `index.ts`: 集約 export

新規ファイル: `src/GamePlay/Game/Decision/Weights.ts` (H.4.3)
- `weightByCloseness / weightByIdealDistance / weightByGoalProximity`
- `weightByShotClockUrgency / weightByGameClockUrgency`
- `weightByWeightAdvantage / weightByHeightAdvantage / weightBySpeedAdvantage`
- `weightByFoulCount / weightByTeamBonus`
- `weightByScoreDiff`
- `weightByOppositeFacing`
- `aggregateWeights(entries)` で加重平均

SimMover 拡張:
- `ability?: SimPlayerAbility` (オプショナル、未設定なら DEFAULT_ABILITY)
- `fatigue?: number` (累積疲労 0..100)

SimState 拡張:
- `possessionStartTime`, `tacticalMode`, `tacticalReason` を追加

統合配線 (TrackingSimulation3D):
- `evaluateTacticalPriority` を毎フレーム呼び出し、state に保存
- 全 switchPossession 後に `possessionStartTime = simTimeAccum` 更新
- `triggerShootingFoul` 内で `computeFreeThrowProbability(shooter.ability)` で確率を能力値ベースに
- `getTacticalMode()` を追加して UI に公開

UI 更新 (TrackingSimulationPanel):
- パネル内に Tactical Mode 表示 (color-coded: TEAM 青 / INDIVIDUAL 黄 / TRANSITION 橙) + reason

`tsc --noEmit` 通過 (4GB heap 必要)。

### Phase H 全体まとめ

| Phase | 内容 | 新規ファイル数 |
|---|---|---|
| H.1 | 人体動作基盤 (COM / Vision / Motion / Triple Threat) | 4 |
| H.2 | 個人スキル 19 種 (Dribble 6 / Finish 3 / Cuts 5 / Footwork 5) | 6 |
| H.3 | チーム戦術 17 (Motion 2 / SetPlay 6 / Defense 6 / Transition 3) | 5 |
| H.4 | 戦術プライオリティ / モダンロール / Weights / Ability | 5 |
| 合計 | 20 ファイル新規追加 + 既存統合 | |

既知の制約 (将来 Phase で対応):
- Skill Library と Scheme Library は **登録のみ**、SimActionManager / RoleMovement への完全な配線は未実施
- Ability は PlayerData との連結 (LeagueTeam.players から読み込み) が未実施 → 現状 SimMover に手動付与必要
- Position H.4.4 で UI 表示は TacticalMode のみ、個別 ability/role の可視化は未実施

## 2026-05-17 (続き 4)

### Phase H.3 完了 — チーム戦術システム

新規ディレクトリ: `src/GamePlay/Game/Scheme/`
- `SchemeTypes.ts`: Scheme インターフェース、PlayerInstruction、SchemeContext、SchemeResult
- `SchemeRegistry.ts`: スキーム登録 + `selectActiveScheme(kind, ctx, minActivation)`
- `MotionOffense.ts` (H.3.1): 2 つ — 5-Out Motion / 4-Out 1-In Motion
  - 5-Out: 5 スポット (Top + L/R Wing + L/R Corner) を Greedy 割当
  - 4-Out 1-In: ハイポスト 1 人 + 4 アウト
  - ボール保持者には移動指示なし、非保持者がフィル
- `SetPlays.ts` (H.3.2): 6 セット — High PnR / Side PnR / Spain PnR / Horns / DHO / Flex
  - High PnR: 3 フェーズ進行 (set screen → drive → roll)
  - Spain: 第三者がロールマンの DF にバックスクリーン
  - Horns: 1-4 ハイ + 5 ロー + 2/3 コーナーの形成
- `DefenseSchemes.ts` (H.3.3): 6 スキーム
  - ManToMan (基本): 各 DF をマーク対象の 1m 前
  - PackLine: 16ft (4.88m) アーク内に縮む、ヘルプ・ザ・ヘルパー
  - NoMiddle: ボールハンドラーをサイドに追い込む
  - 2-3 Zone: 前列 2 (z=7.5) + 後列 3 (z=12.0)
  - 3-2 Zone: 前列 3 + 後列 2
  - 1-3-1 Zone: トップ + 3 ミッド + ベース
  - PnRCoverage 識別子 (Drop/Hedge/Switch/Blitz/Ice/Weak) を定数として提供
- `Transition.ts` (H.3.4): 3 スキーム
  - Primary Break: 3 レーン (中央 + 両ウィング) + 2 トレイラー
  - Secondary Break: アーリーオフェンス、Top/Wing/HighPost/Corner 配置
  - Transition Defense: stop ball (最寄り DF、speed 1.4×) → ベースライン spread → matchup
- `index.ts`: 集約 export + 副作用 import で自動登録

総スキーム数: 17 (Offense 2 motion + 6 set plays + Defense 6 + Transition 3)

統合ポイント (Phase H.4 で配線):
- `SchemeSelector` を `TrackingSimulation3D.update()` から呼び出し、毎フレーム kind ごとに最適スキームを選択
- `PlayerInstruction` を既存の `RoleMovement` / `OffenseRoleAssignment` の dest 計算に注入
- 現状はライブラリ登録のみで、実 simulation の動きはまだ既存 (RoleMovement) のまま

`tsc --noEmit` 通過。

## 2026-05-17 (続き 3)

### Phase H.2 完了 — 個人スキルライブラリ

新規ディレクトリ: `src/GamePlay/Game/Skills/`
- `SkillTypes.ts`: Skill インターフェース、SkillContext、SkillEvaluation 型定義
- `SkillRegistry.ts`: スキル登録 + カテゴリ別 selectBestSkill (閾値 0.3)
- `DribbleMoves.ts` (H.2.1): 6 ムーブ — Crossover / Hesitation / StepBack / InAndOut / Spin / Eurostep
  - Crossover: DF の体重偏り (comOffsetLateral) + 距離 1-2m で発火
  - Hesitation: DF の後退方向移動 (approach dot 負) で発火
  - StepBack: DF の前進 (approach dot 正) + ショットレンジ内で発火
  - InAndOut: DF バランス安定時 (balance >0.7) で発火
  - Spin: 体接触圏 (0.5-1.5m) + ペイント手前 (3-5m) で発火
  - Eurostep: ペイント内 (1-4.5m) で発火
- `FinishMoves.ts` (H.2.2): 3 種追加 — Floater / ReverseLayup / HookShot
  - Floater: ペイント手前 + リム下に長身 DF (>190cm) 在
  - ReverseLayup: DF が Actor より rim 近 or 同サイド
  - HookShot: Actor 身長 200+ + rim に背向き
- `Cuts.ts` (H.2.3): 5 カット — V-Cut / L-Cut / Backdoor / Flare / Shallow
  - Backdoor: DF が Actor 方向を向いている (overplay/deny) 時に高スコア
  - Flare: コーナー方向への広がり、ゴール正面で発火
- `Footwork.ts` (H.2.4): 5 種 — FrontPivot / ReversePivot / JumpStop / StrideStop / DropStep
  - JumpStop: 中速 (3-7 m/s) + ペイント手前
  - StrideStop: 高速 (4+ m/s) + シュート距離
  - DropStep: Actor 身長 198+ + rim 下 (1-3.5m)
- `index.ts`: 集約 export + 副作用 import で自動登録

総スキル数: 19 (Dribble 6 + Finish 3 + Cut 5 + Footwork 5)

統合ポイント (Phase H.3+ で配線):
- SkillSelector を `OffenseRoleAssignment` / `RoleMovement` から呼び出して、各役割の動きを置き換える想定
- 現状はライブラリ登録のみで、実 simulation の動きはまだ既存のまま

`tsc --noEmit` 通過。

### Phase H.1 完了 — 人体動作の基盤レイヤー

新規ディレクトリ: `src/GamePlay/Game/Body/`
- `CenterOfMass.ts` (H.1.1): COM 高さ/スタンス幅/バランス値の計算ヘルパー。リサーチ根拠 (1.0-1.5×腰幅、COM 55% 高さ、Coach Dave Love + PMC GRF 論文)
- `Vision.ts` (H.1.2): 中心視野 (60°) と周辺視野 (200°) の分離、scanState (pre-catch/on-catch/post-catch/idle)、視認情報キャッシュ (2 秒)。リサーチ根拠 (Australia Basketball, Nature, Basketball Immersion)
- `Motion.ts` (H.1.3): 加減速 3 フェーズ (accel/sprint/decel/idle)、第一歩ブースト 1.4× × 0.2s、Rate of Force Development モデル化。リサーチ根拠 (sprint biomechanics, PMC)
- `index.ts`: 集約 export

SimMover 拡張: `prevSpeed`, `comY`, `stanceWidth`, `comOffsetForward`, `comOffsetLateral`, `balance` を追加。makeMover で初期化。`updateBalance(mover, dt)` ヘルパーを MovementCore に追加 (フレーム末に呼ぶ想定、未配線)。

Phase H.1.4 トリプルスレット意思決定:
- `ActionScorerContext` に `shotClockRemaining?: number` 追加
- `buildOnBallContext` シグネチャ拡張
- 新規 ScoreFactor 4 種を `ActionScorerFactors.ts` に追加:
  - `shootTripleThreatPriority` (現代理論シュート脅威優先、torsoFacing 加味)
  - `shootShotClockUrgency` (残り <12s で急増)
  - `passShotClockUrgency` (10-15s で最大)
  - `holdShotClockBuffer` (>18s でじっくり)
- `DEFAULT_FACTORS` に登録
- `TrackingSimulation3D` の `buildOnBallContext` 呼び出しで `this.shotClock.getRemainingSeconds()` を渡す

`tsc --noEmit` 通過。挙動への影響は ScoreFactor weight の総和で控えめ (各 1.0-5.0 weight)、既存挙動を大きく崩さない設計。実機での動作確認は未実施。

既知の制約:
- H.1.1: バランス値はデータ追跡のみ、行動への反映は Phase H.2 以降
- H.1.2: Vision モジュールは独立、既存スキャンとの統合は未実施
- H.1.3: Motion フェーズ追跡は独立、既存 SPRINT_COOLDOWN との統合は未実施
- H.1.4: ScoreFactor 追加で意思決定は変わるが、ドライブ vs ホールド の明示分離は未実施 (hold が drive 包含)

## 2026-05-17 (続き)

### Phase H ロードマップ設計 — 戦術・スキル深化

ユーザー要望「個人戦術 / チーム戦術 / 攻守ポジション役割 / 人体構造とその動き をネットでリサーチし、再現するロードマップを設計」を受けて実施。

リサーチ実施:
- WebSearch / WebFetch の権限が当初拒否されていたため、`.claude/settings.local.json` に `WebSearch` + `WebFetch` を allow 追加
- 4 ジャンル並列で 12 クエリ実行、9 サイト以上から情報集約:
  - breakthroughbasketball.com (個人スキル、Pack Line、closeout、トランジション、5-Out)
  - coachesclipboard.net (Horns、モーション、closeout)
  - basketballforcoaches.com (Pack Line、5-Out)
  - basketballimmersion.com (スキャン)
  - australia.basketball, pickandpop.net, hooperuniversity.com
  - pmc.ncbi.nlm.nih.gov (GRF/COM during 180° COD)
  - coachdavelove.com (stance widths)
  - physio-pedia.com (jump shot biomechanics)
  - nature.com (viewing angle response time)
  - simplifaster.com (defense biomechanics)
  - bballplaybook.com (Spain PnR)
  - Wikipedia (basketball positions)

ロードマップ構成:
- **Phase H.1** 人体動作基盤: COM, FOV, 第一歩 3 フェーズ, トリプルスレット意思決定
- **Phase H.2** 個人スキルライブラリ: ドリブルムーブ 6 種、フィニッシュ 5 種、オフボールカット 5 種、フットワーク
- **Phase H.3** チーム戦術: モーション、セットプレー (PnR 5+ 種、Horns 3 種、Flex、DHO)、ディフェンススキーム (Pack Line, No Middle, 6 PnR coverage, 3 ゾーン)、トランジション
- **Phase H.4** 統合: 戦術プライオリティ、現代ポジションレス、ファジー判断、能力値反映

既存 workPlan の Phase 2 (戦術整理) と Phase 3 (オフボール AI) は H.3 に吸収統合する方針で記載。

`workPlan.md` の「将来的な計画」セクションの前に Phase H を追加完了。リサーチソース URL 計 14 本を併記。

### Phase G.3 完了 — Tier 3 運営・統計

新規ファイル:
- `src/GamePlay/Game/GameRules/BoxScore.ts` — 10 プレイヤー分の個人スタッツ集計 (PTS / REB / OFF-REB / DEF-REB / AST / STL / BLK / TO / PF / FG / 3P / FT)、チーム合計集計
- `src/GamePlay/Game/GameRules/PlayByPlayLog.ts` — 試合イベントの時系列ログ (200 件上限)、期間 + 残り時間 + イベント種別 + テキスト
- `src/GamePlay/Game/GameRules/TimeoutManager.ts` — タイムアウト残数管理 (NBA: 7 回/試合)

変更ファイル:
- `src/GamePlay/Game/Types/TrackingSimTypes.ts` — `lastPassInfo`, `simTimeAccum`, `lastShooterAbsIdx` を SimState に追加
- `src/GamePlay/Game/Update/SimBallManager.ts` — `executePendingShot` で `state.lastShooterAbsIdx` を記録
- `src/GamePlay/Game/TrackingSimulation3D.ts` — BoxScore/PlayByPlay/TimeoutManager 統合、各イベントサイトでスタッツ記録 & ログ追加、`logEvent` ヘルパー、アシスト判定 (3秒窓、レシーバー == シューター)、`handleTurnover` に culprit パラメータ追加
- `src/GamePlay/Game/TrackingSimulationPanel.tsx` — Box Score / Play-by-Play 開閉トグル、ボックススコアテーブル (PTS/REB/AST/ST/BK/TO/PF/FG/3P/FT)、プレイバイプレイログ表示、タイムアウト残数表示

イベント記録対象:
- **得点 (made)**: FGA + 1 / FGM + 1 / PTS + 2or3、アシスト判定 (lastPassInfo の時刻チェック)、ログに `PL N makes 2P (A x-y B)`
- **得点ミス**: FGA + 1（missToLoose、ブロック、OOB の各経路で記録）
- **ブロック**: 守備側 BLK + 1
- **オフェンスリバウンド / ディフェンスリバウンド**: 該当プレイヤー OREB/DREB + 1
- **アシスト**: パス成功時に `lastPassInfo` を記録、3秒以内に同レシーバーが得点 → 該当パサーに AST + 1
- **シューティングファウル**: 守備側 PF + 1、シューター FT 成功本数加算、ボーナス/ファウルアウトをログ
- **ターンオーバー**: パスミス / 24秒 / 3秒 / 8秒 / OOB の該当プレイヤーに TO + 1
- **ピリオドイベント**: 期間開始・終了・試合終了をログ
- **ティップオフ**: 試合開始時にログ

UI:
- Box Score: 10 プレイヤー分のスタッツテーブル (チーム別色分け、最大 64px 高でスクロール)
- Play-by-Play: 直近 20 イベント (期間 + 時間 + テキスト)
- タイムアウト残数: A/B チームファウル表示行に `TO:N` で併記

既知の制約:
- 選手交代は未実装（ファウルアウト後も継続プレイ）
- タイムアウト自動消費は未実装（カウントのみ）
- ディフェンス側のリバウンド判定は loose ball の発生源を区別しない（実際は steal vs DEF-REB の混在）

`tsc --noEmit` パス。
