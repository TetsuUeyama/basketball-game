import type { ActionScorerResult } from "./ActionScorerTypes";
import type { ViolationState } from "../GameRules/ViolationDetector";
import type { SimPlayerAbility } from "../Tactics/PlayerAbility";

export interface SimMover {
  x: number; z: number;
  y: number;              // 垂直位置（0 = 地面）
  vx: number; vz: number;
  vy: number;             // 垂直速度（正 = 上昇）
  speed: number;
  lastSpeed: number;     // 直前フレームの実効移動速度 (m/s)
  prevSpeed: number;     // 2 フレーム前の実効速度 (加速度算出用、Phase H.1.1)
  momentumVx: number;    // 空中慣性 X (ジャンプ開始時にスナップショット)
  momentumVz: number;    // 空中慣性 Z (ジャンプ開始時にスナップショット)
  facing: number;        // 下半身の向き
  torsoFacing: number;   // 上半身の向き
  neckFacing: number;    // 首の向き（基準が上半身）
  nextTurn: number;
  height: number;        // 身長 (cm) 150〜225
  weight: number;        // 体重 (kg)
  scale: number;         // height / BASE_HEIGHT_CM — 描画・衝突スケール
  // --- Phase H.1.1: 重心 (Center of Mass) モデル ---
  /** COM 高さ (m)、scale から導出 */
  comY: number;
  /** スタンス幅 (m)、scale から導出。スタンス種別 (normal/defensive) で変化 */
  stanceWidth: number;
  /** COM の前後オフセット (m)、加減速で変化。正=前傾、負=後傾 */
  comOffsetForward: number;
  /** COM の左右オフセット (m)、急な方向転換で変化 */
  comOffsetLateral: number;
  /** バランス値 0..1 (1=安定、0=完全崩れ)。<0.4 で off-balance */
  balance: number;
  /** Phase H.4.4: 個人能力 (未設定なら DEFAULT_ABILITY) */
  ability?: SimPlayerAbility;
  /** Phase H.4.4: 累積疲労 0..100 (試合中に蓄積、休憩で減少) */
  fatigue?: number;
}

export interface SimBall {
  active: boolean;
  x: number; z: number;
  vx: number; vz: number;
  age: number;
}

export interface SimScanMemory {
  lastSeenLauncherX: number;
  lastSeenLauncherZ: number;
  lastSeenTargetX: number;
  lastSeenTargetZ: number;
  searching: boolean;
  searchSweep: number;
  searchDir: 1 | -1;
}

export interface SimPreFireInfo {
  targetIdx: number;
  estFlightTime: number;
  estIPx: number;
  estIPz: number;
  obReaches: number[];
  obInFOVs: boolean[];
  obBlocks: boolean[];
  targetReach: number;
  targetCanReach: boolean;
  blocked: boolean;
}

export interface TrackingSimScore {
  hit: number;
  block: number;
  miss: number;
  steal: number;   // ディフェンス成功（ルーズボール確保）
  goal: number;    // シュート成功
  shotMiss: number; // シュートミス
}

export interface LauncherState {
  dest: { x: number; z: number } | null;
  reevalTimer: number;
  bestPassTargetIdx: number;
}

export interface SlasherState {
  dest: { x: number; z: number } | null;
  reevalTimer: number;
  vcutPhase: number;
  vcutActive: boolean;
}

export interface ScreenerState {
  dest: { x: number; z: number } | null;
  reevalTimer: number;
  screenSet: boolean;
  holdTimer: number;
}

export interface DunkerState {
  dest: { x: number; z: number } | null;
  reevalTimer: number;
  sealing: boolean;
}

export interface ScanResult {
  atLauncher: boolean;
  timer: number;
  focusDist: number;
}

// =========================================================================
// Action common types
// =========================================================================

/** アクションのフェーズ */
export type ActionPhase = 'idle' | 'charge' | 'startup' | 'active' | 'recovery';

/** アクションの種類 */
export type ActionType = 'idle' | 'pass' | 'shoot' | 'move' | 'catch' | 'obstacle_react' | 'block';

/**
 * アクションのタイミング定義（秒）
 * charge → startup → active → recovery の順に遷移する
 */
export interface ActionTiming {
  /** チャージ時間（0 = チャージなし。シュートでは距離に応じて増加） */
  charge: number;
  /** 実行し発生するまでの時間（予備動作） */
  startup: number;
  /** アクションの実行時間 */
  active: number;
  /** 実行後、次の行動に移行できるまでの時間（硬直） */
  recovery: number;
}

/** アクションの実行時ランタイム状態 */
export interface ActionState {
  /** アクションの種類 */
  type: ActionType;
  phase: ActionPhase;
  /** 現在フェーズの経過時間 */
  elapsed: number;
  /** アクションのタイミング定義（idleの時はnull） */
  timing: ActionTiming | null;
}

// =========================================================================
// PassAction types
// =========================================================================

/** 発射評価に必要な状態スナップショット */
export interface BallFireContext {
  launcher: SimMover;
  targets: SimMover[];
  obstacles: SimMover[];
  obIntSpeeds: number[];
}

/** プレファイア評価の結果 */
export interface PreFireEvalResult {
  selectedTargetIdx: number;
  preFire: SimPreFireInfo | null;
}

/** 発射ソリューション */
export interface FireSolution {
  targetIdx: number;
  interceptX: number;
  interceptZ: number;
  flightTime: number;
  targetVelocity: { vx: number; vz: number };
  obInFOVs: boolean[];
}

/** 障害物のリアクション */
export interface ObstacleReaction {
  obstacleIdx: number;
  reacting: boolean;
  vx: number;
  vz: number;
}

/** 発射試行の結果 */
export interface FireAttemptResult {
  fired: boolean;
  solution: FireSolution | null;
  newCooldown: number;
}

/** ボール結果判定 */
export type BallResultType = 'block' | 'hit' | 'miss' | 'landed' | 'none';

export interface BallResultDetection {
  result: BallResultType;
  cooldownTime: number;
}

// =========================================================================
// Push Obstruction
// =========================================================================

/** プッシュ妨害情報 */
export interface PushObstructionInfo {
  obstacleIdx: number;       // 障害物インデックス (0-4)
  targetEntityIdx: number;   // マーク対象entityIdx (0=launcher, 1-4=targets)
  pushArm: 'left' | 'right'; // 使用する腕
  armTargetX: number;        // 腕ターゲットX
  armTargetZ: number;        // 腕ターゲットZ
}

// =========================================================================
// Simulation state (shared across update modules)
// =========================================================================

/** TrackingSimulation3D の全ランタイム状態を集約 */
export interface SimState {
  // --- Possession & team structure ---
  allPlayers: SimMover[];           // [10] 永続エンティティ (0-4=チームA, 5-9=チームB)
  possession: 0 | 1;               // 0=チームA攻撃, 1=チームB攻撃
  offenseBase: number;              // 0 or 5 — オフェンス側エンティティの開始インデックス
  defenseBase: number;              // 5 or 0 — ディフェンス側エンティティの開始インデックス
  attackGoalX: number;              // 攻撃ゴールX（常に0）
  attackGoalZ: number;              // 攻撃ゴールZ（+12.725 or -12.725）
  defendGoalZ: number;              // 守備ゴールZ（ファストブレイク時のリトリート先）
  zSign: 1 | -1;                   // ゾーン座標ミラーリング（チームAオフェンス=+1, チームBオフェンス=-1）
  teamScores: [number, number];     // [チームAゴール数, チームBゴール数]

  // --- Offense / Defense aliases (possession切替時に再代入) ---
  launcher: SimMover;
  targets: SimMover[];
  obstacles: SimMover[];

  // --- Ball state ---
  ballActive: boolean;
  ballAge: number;
  score: TrackingSimScore;
  cooldown: number;
  onBallEntityIdx: number;
  selectedReceiverEntityIdx: number;
  preFire: SimPreFireInfo | null;
  interceptPt: { x: number; z: number } | null;
  obReacting: boolean[];
  actionStates: ActionState[];
  pendingFire: FireSolution | null;
  pendingCooldown: number;
  moveDistAccum: number[];
  obScanAtLauncher: boolean[];
  obScanTimers: number[];
  obFocusDists: number[];
  obMems: SimScanMemory[];
  targetDests: ({ x: number; z: number } | null)[];
  targetReevalTimers: number[];
  launcherState: LauncherState;
  onBallTargetState: LauncherState;
  slasherState: SlasherState;
  screenerState: ScreenerState;
  dunkerState: DunkerState;
  obstacleDeflectCooldowns: number[];
  pushObstructions: PushObstructionInfo[];
  looseBall: boolean;  // ルーズボール状態フラグ
  offenseInTransit: boolean[];  // オフェンスがゾーンへ移動中フラグ (launcher + targets)
  pendingShot: { x: number; y: number; z: number } | null;  // シュートターゲット座標
  prevBallY: number;  // 前フレームのボールY座標（ゴール通過判定用）
  lastScorerResult: ActionScorerResult | null;  // 直近の ActionScorer 評価結果
  goalScoredTimer: number;  // ゴール成功後のリセット待機タイマー（0=待機なし）
  lastShotReleasePos: { x: number; z: number } | null;  // 直前のシュート発射位置（2P/3P判定用）
  lastShotPoints: 0 | 2 | 3;  // 直前のゴール成功時の得点 (UI 表示用、0 = 未確定)
  periodTransitionTimer: number;  // クォーター/OT 終了後の待機タイマー (秒)。0 = 待機なし
  violationState: ViolationState;  // 3秒・8秒バックコート違反検知用
  /** 直近イベント (UI 表示用、空文字で非表示) */
  lastEventMessage: string;
  /** lastEventMessage を表示する残り時間 (秒) */
  lastEventTimer: number;
  /** ファウル/FT 解決中フラグ (true 中は通常update を停止) */
  freezeDuringFreeThrow: boolean;
  /** 進行中の FT 解決の残り時間 (秒) */
  freeThrowResolveTimer: number;
  /** 直前のパス成功情報 (アシスト判定用、3秒以内に成立シュートで assist) */
  lastPassInfo: { passerAbsIdx: number; receiverAbsIdx: number; timeOfPass: number } | null;
  /** 累積シミュレーション時間 (秒、アシスト窓判定で使用) */
  simTimeAccum: number;
  /** 直前にシュートを撃った絶対インデックス (-1 = 未確定) */
  lastShooterAbsIdx: number;
  /** Phase H.4.1: 現在のポゼッション開始時刻 (sim time) */
  possessionStartTime: number;
  /** Phase H.4.1: 直近の戦術プライオリティ評価結果 */
  tacticalMode: 'team' | 'individual' | 'transition';
  tacticalReason: string;
  /** Phase H.5: 現在 active なオフェンススキーム名 (UI 表示用、null = 無し) */
  activeOffenseSchemeId: string | null;
  /** Phase H.5: 現在 active なディフェンススキーム名 */
  activeDefenseSchemeId: string | null;
  /** Phase H.5: 現在 active なトランジションスキーム名 */
  activeTransitionSchemeId: string | null;
  /** Phase H.5: オフボール選手のカット中状態 (offense rel idx 0-4 → カット情報) */
  cutStates: { skillId: string; dest: { x: number; z: number }; remainingTime: number }[];
  /** Phase H.5: 現フレームのオフェンス指示 (SchemeRunner が更新) */
  schemeOffenseInstructions: { entityIdx: number; dest: { x: number; z: number } | null; speedMult: number; priority: number; label?: string }[];
  /** Phase H.5: 現フレームのディフェンス指示 */
  schemeDefenseInstructions: { entityIdx: number; dest: { x: number; z: number } | null; speedMult: number; priority: number; label?: string }[];
  /** Phase H.5: 現フレームのトランジション指示 */
  schemeTransitionInstructions: { entityIdx: number; dest: { x: number; z: number } | null; speedMult: number; priority: number; label?: string }[];
}
