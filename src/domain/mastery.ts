import type { SkillId } from "../theme/tokens";

// The adaptive core.
//
// 1) Difficulty per drill type moves on a *weighted up-down staircase*
//    (Kaernbach 1991): after a success the level rises by UP, after a
//    failure it falls by DOWN, with DOWN/UP = p/(1-p). That makes the level
//    settle where you succeed about p of the time. p = 0.82 sits right at
//    the "85% rule" sweet spot for learning (Wilson et al., 2019): hard
//    enough that you still miss sometimes, easy enough to keep going.
//
// 2) Skill mastery (0-100) is an Elo-style rating: each scored attempt
//    nudges it toward what the result implies given the difficulty faced.
//    Big moves early, smaller once there's history.

export const TARGET_SUCCESS = 0.82;
const STEP = 1;
const UP = STEP * (1 - TARGET_SUCCESS); // 0.18
const DOWN = STEP * TARGET_SUCCESS; // 0.82
export const MIN_LEVEL = 1;
export const MAX_LEVEL = 10;

export function nextDifficulty(level: number, success: boolean): number {
  const next = success ? level + UP : level - DOWN;
  return Math.round(Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, next)) * 100) / 100;
}

export interface SkillRating {
  rating: number; // 0-100
  attempts: number;
}

export const INITIAL_RATING = 25;
const SCALE = 15;

// The rating at which you'd be expected to score 50% at this difficulty.
export function difficultyToRating(level: number): number {
  return level * 10;
}

export function expectedScore(rating: number, level: number): number {
  return 1 / (1 + Math.exp(-(rating - difficultyToRating(level)) / SCALE));
}

export function updateRating(current: SkillRating, score: number, level: number): SkillRating {
  const k = Math.max(4, 24 / Math.sqrt(1 + current.attempts / 5));
  const expected = expectedScore(current.rating, level);
  const rating = Math.max(0, Math.min(100, current.rating + k * (score - expected)));
  return { rating: Math.round(rating * 10) / 10, attempts: current.attempts + 1 };
}

// Spaced review: 1 -> 3 -> 7 -> 14 -> 30 days; a weak review resets to 1.
const REVIEW_INTERVALS = [1, 3, 7, 14, 30];

export function nextReviewIntervalDays(previousDays: number | null, success: boolean): number {
  if (!success || previousDays == null) return REVIEW_INTERVALS[0];
  const idx = REVIEW_INTERVALS.findIndex((d) => d > previousDays);
  return idx === -1 ? REVIEW_INTERVALS[REVIEW_INTERVALS.length - 1] : REVIEW_INTERVALS[idx];
}

export const SKILLS: SkillId[] = ["articulation", "cadence", "impromptu", "confidence"];

// 1-5 level for the legacy curriculum shim (prompt tier, durations).
export function legacyLevelFromDifficulty(level: number): 1 | 2 | 3 | 4 | 5 {
  return Math.max(1, Math.min(5, Math.ceil(level / 2))) as 1 | 2 | 3 | 4 | 5;
}
