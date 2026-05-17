/**
 * Scheme — チーム戦術モジュールの集約 export
 * Phase H.3 で追加。Motion / SetPlays / DefenseSchemes / Transition を提供。
 *
 * 各モジュールは import 時に SchemeRegistry へ自動登録される。
 */

export * from "./SchemeTypes";
export * from "./SchemeRegistry";

// 副作用 import (自動登録)
import "./MotionOffense";
import "./SetPlays";
import "./DefenseSchemes";
import "./Transition";

export { ALL_MOTION_SCHEMES } from "./MotionOffense";
export { ALL_SET_PLAYS } from "./SetPlays";
export { ALL_DEFENSE_SCHEMES, PNR_COVERAGE_LABELS } from "./DefenseSchemes";
export type { PnRCoverage } from "./DefenseSchemes";
export { ALL_TRANSITION_SCHEMES } from "./Transition";
