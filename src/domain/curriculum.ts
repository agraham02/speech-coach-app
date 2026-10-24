import type { DifficultyTier, Prompt } from "./sessionTypes";
import type { WarmUpIntensity } from "./warmUpRoutine";
import { PREP_DURATION_STEP_SECONDS, randomStepValue, type DurationMode } from "./recordingSettings";

// Practice difficulty: one 1-5 step that sets the prompt pool, the
// recording length, the prep time and the warm-up. It follows the adaptive
// difficulty of impromptu reps (services/db/curriculumRepo.ts
// recomputeCurriculumLevel, from the "rep" staircase in mastery.ts), or a
// step the person pinned. The old engine that moved it from composite scores
// (evaluateCurriculum, the spontaneous/drill composites and the "rich
// delivery" score) had no callers since the path engine replaced it and was
// removed in session 07 (docs/decisions/scoring-taxonomy.md).
export type CurriculumLevel = 1 | 2 | 3 | 4 | 5;

// Everyone starts at the bottom: the shortest recording and the longest,
// most predictable prep.
export const DEFAULT_CURRICULUM_LEVEL: CurriculumLevel = 1;

export const MIN_TIER_POOL_SIZE = 15;

export type CurriculumDirection = "up" | "down" | "none" | "initial";
// What a curriculum_state row says moved the step. Only "overall" (the rep
// staircase) and "initial" are written now.
export type CurriculumComponent = "overall" | "delivery" | "coherence" | "drill";
export type CurriculumReason = "changed" | "insufficient_data" | "cooldown" | "stable";

export interface CurriculumDecision {
  level: CurriculumLevel;
  direction: CurriculumDirection;
  component: CurriculumComponent | null;
  componentScore: number | null;
  reason: CurriculumReason;
  spontaneousSessionCount: number;
}

export interface CurriculumExplanationContext {
  direction: CurriculumDirection;
  component: CurriculumComponent | null;
  componentScore: number | null;
  reason: CurriculumReason;
  level: CurriculumLevel;
  overrideActive: boolean;
}

// What Level & difficulty and Trends say about the level. Since curriculum
// v2 the auto level follows the impromptu rep staircase (curriculumRepo's
// recomputeCurriculumLevel), not evaluateCurriculum() above, so the copy
// describes that: a rep that goes well nudges it up a little, one that's a
// stretch eases it back. The override template supersedes everything else.
export function explainCurriculumChange(ctx: CurriculumExplanationContext): string {
  if (ctx.overrideActive) {
    return `You've set step ${ctx.level} for Practice — it stays there until you switch back to Auto. Lessons and your daily plan still follow your reps.`;
  }
  if (ctx.direction === "initial") {
    return `Starting at step ${ctx.level}. From here it follows your impromptu reps.`;
  }
  if (ctx.reason === "changed" && ctx.direction === "up") {
    return `Your recent reps went well — moving up to step ${ctx.level}.`;
  }
  if (ctx.reason === "changed" && ctx.direction === "down") {
    return `Your last rep was a stretch — easing back to step ${ctx.level}.`;
  }
  return `Step ${ctx.level}. It follows your impromptu reps: each one that goes well nudges it up a little, and one that's a stretch eases it back.`;
}

export function levelToDifficultyTier(level: CurriculumLevel): DifficultyTier {
  if (level <= 2) return "easy";
  if (level === 3) return "medium";
  return "hard";
}

export function difficultyTierLabel(tier: DifficultyTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

const LEVEL_DURATION_SECONDS: Record<CurriculumLevel, number> = {
  1: 60,
  2: 120,
  3: 180, // matches DEFAULT_RECORDING_DURATION_SETTINGS.fixedSeconds exactly — a sanity check this mapping is calibrated to today's default
  4: 240,
  5: 300,
};

export function curriculumLevelToDurationSeconds(level: CurriculumLevel): number {
  return LEVEL_DURATION_SECONDS[level];
}

// Prep time moves the opposite direction from recording length, and for the
// opposite reason: recording length grows because sustained speaking is the
// skill being built, while prep time shrinks because leaning on a long,
// predictable brainstorm window is the crutch that's meant to fall away.
// Level 1-2 (the "easy" tier) get an exact, unchanging window — one less
// variable while the habit is still new. Level 3+ ("medium"/"hard", same
// split as levelToDifficultyTier) switches to a shrinking *range* instead of
// a single number, so prep also gets less predictable, not just shorter —
// real spontaneous speaking rarely gives you a fixed countdown. Judgment
// call, not empirically tuned — see LEVEL_WARM_UP_INTENSITY's note above for
// the same caveat. minSeconds never goes below PREP_DURATION_MIN_SECONDS(10)
// — the floor the manual slider already enforces.
const LEVEL_PREP_RANGE: Record<CurriculumLevel, { minSeconds: number; maxSeconds: number }> = {
  1: { minSeconds: 60, maxSeconds: 60 }, // exactly 1 minute, matches PREP_DURATION_MAX_SECONDS
  2: { minSeconds: 40, maxSeconds: 40 },
  3: { minSeconds: 20, maxSeconds: 40 }, // matches DEFAULT_PREP_PHASE_SETTINGS.fixedSeconds(30) as its midpoint
  4: { minSeconds: 10, maxSeconds: 30 },
  5: { minSeconds: 10, maxSeconds: 20 },
};

// A level's range collapses to a single value at Level 1-2 (min === max) and
// widens into real variation at Level 3+ — this derives "fixed" vs "random"
// from that same range instead of a second, independently-maintained table.
export function curriculumLevelToPrepMode(level: CurriculumLevel): DurationMode {
  const { minSeconds, maxSeconds } = LEVEL_PREP_RANGE[level];
  return minSeconds === maxSeconds ? "fixed" : "random";
}

// The prep duration to use — a fresh random draw within the level's range at
// Level 3+ (naturally degenerates to always returning the fixed value at
// Level 1-2, since randomStepValue(min, max, step) with min === max has
// exactly one possible outcome). Callers wanting a NEW draw each recording
// (not a cached preview) should call this again right before starting, same
// as resolvePrepDurationSeconds/resolveRecordingDurationSeconds.
export function curriculumLevelToPrepSeconds(level: CurriculumLevel): number {
  const { minSeconds, maxSeconds } = LEVEL_PREP_RANGE[level];
  return randomStepValue(minSeconds, maxSeconds, PREP_DURATION_STEP_SECONDS);
}

// Judgment call, not something explicitly specified a direction for (see
// Phase 5's plan notes): harder levels get a longer, more thorough warm-up,
// mirroring how a harder workout gets a longer warm-up. Flip this table if
// it doesn't feel right in practice (e.g. more warm-up support for
// beginners at easy levels instead).
const LEVEL_WARM_UP_INTENSITY: Record<CurriculumLevel, WarmUpIntensity> = {
  1: "short",
  2: "short",
  3: "medium",
  4: "long",
  5: "long",
};

export function curriculumLevelToWarmUpIntensity(level: CurriculumLevel): WarmUpIntensity {
  return LEVEL_WARM_UP_INTENSITY[level];
}

// Filters the prompt pool to the curriculum's tier before the existing
// pickTodaysPrompt/pickRandomPrompt run (both stay untouched). Widens to
// the adjacent tier(s) if the exact tier is too small, then falls back to
// the full unfiltered pool if even the widened pool is empty (mirrors
// pickTodaysPrompt's own internal fallback idiom). MIN_TIER_POOL_SIZE=15 is
// set well above pickTodaysPrompt's AVOID_REPEAT_LAST_N=20 exclusion window
// so this filter doesn't silently defeat itself.
export function filterPromptsByTier(prompts: Prompt[], tier: DifficultyTier, minPoolSize = MIN_TIER_POOL_SIZE): Prompt[] {
  const exact = prompts.filter((p) => p.difficultyTier === tier);
  if (exact.length >= minPoolSize) return exact;

  const adjacentTiers: DifficultyTier[] = tier === "medium" ? ["easy", "hard"] : ["medium"];
  const widened = prompts.filter((p) => p.difficultyTier === tier || (p.difficultyTier && adjacentTiers.includes(p.difficultyTier)));
  return widened.length > 0 ? widened : prompts;
}
