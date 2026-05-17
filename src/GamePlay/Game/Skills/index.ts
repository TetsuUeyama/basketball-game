/**
 * Skills — 個人スキルライブラリの集約 export
 * Phase H.2 で追加。Dribble / Finish / Cut / Footwork を提供。
 *
 * 各モジュールは import 時に SkillRegistry へ自動登録される。
 */

export * from "./SkillTypes";
export * from "./SkillRegistry";

// 副作用 import (自動登録)
import "./DribbleMoves";
import "./FinishMoves";
import "./Cuts";
import "./Footwork";

export { ALL_DRIBBLE_MOVES } from "./DribbleMoves";
export { ALL_FINISH_MOVES } from "./FinishMoves";
export { ALL_CUTS } from "./Cuts";
export { ALL_FOOTWORK } from "./Footwork";
