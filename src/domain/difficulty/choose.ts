import { MAX_LEVEL, MIN_LEVEL } from "../mastery";
import type { Stage } from "../levels";
import { getGridRow } from "../../content/skillGrid";
import type { LeafId } from "../scoring/skillTree";

// Which difficulty an attempt runs at (docs/overhaul/PLAN.md, 6.7, rules 3, 4
// and 6). Each activity keeps its own staircase (mastery.ts); this decides where
// it starts and keeps it honest:
// - The first time, it starts where your skill is: (leaf score − 20) ÷ 10. With
//   Word retrieval at 60, a new sprint starts at 4, not 1.
// - If it drifts more than 2 levels from what your leaf implies, it's pulled back.
// - Once a stage is earned on that leaf, it won't drop below that stage's floor:
//   Steady 2, Strong 4, Polished 5. Three misses in a row eases the floor by 1 for
//   the rest of that session, so a bad day doesn't pile up.
// Pure.

export const MAX_DRIFT = 2;
export const STAGE_FLOORS: Partial<Record<Stage, number>> = { 3: 2, 4: 4, 5: 5 };
export const MISSES_TO_EASE = 3;

const clamp = (x: number) => Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, x));
const round2 = (x: number) => Math.round(x * 100) / 100;

export function impliedLevel(leafRating: number): number {
  return clamp((leafRating - 20) / 10);
}

export function floorFor(stage: Stage | null, missesInARow: number): number {
  const floor = (stage && STAGE_FLOORS[stage]) ?? MIN_LEVEL;
  return Math.max(MIN_LEVEL, missesInARow >= MISSES_TO_EASE ? floor - 1 : floor);
}

export function chooseLevel(input: {
  // The staircase's stored level; null the first time.
  stored: number | null;
  // The activity's main leaf, when it has one.
  leafRating: number | null;
  leafStage: Stage | null;
  missesInARow: number;
}): number {
  const implied = input.leafRating != null ? impliedLevel(input.leafRating) : null;
  let level = input.stored ?? implied ?? MIN_LEVEL;
  if (implied != null) level = Math.max(implied - MAX_DRIFT, Math.min(implied + MAX_DRIFT, level));
  level = Math.max(level, floorFor(input.leafStage, input.missesInARow));
  return round2(clamp(level));
}

// The leaf an activity's difficulty follows: the first main move in its grid row,
// else its first move.
export function mainLeafOf(activityId: string): LeafId | null {
  const row = getGridRow(activityId);
  if (!row || !row.moves.length) return null;
  return (row.moves.find((m) => m.weight === "main") ?? row.moves[0]).leaf;
}
