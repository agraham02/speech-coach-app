import { MAX_LEVEL, MIN_LEVEL } from "../mastery";
import type { DifficultyTier, Prompt } from "../sessionTypes";
import type { WarmUpIntensity } from "../warmUpRoutine";

// One difficulty scale, 1 to 10, for every attempt (docs/overhaul/PLAN.md, 6.7,
// rule 1): Easy 1-3, Medium 4-6, Hard 7-10. It replaces the old 1-5 "practice
// step" (curriculum.ts, removed in task 3d.1). A take's settings come from its
// difficulty, and a take you set up yourself gets a difficulty from its
// settings. Pure.

export type DifficultyBand = "Easy" | "Medium" | "Hard";

export const clampLevel = (level: number): number => Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, level));

export function bandOf(level: number): DifficultyBand {
  const l = clampLevel(level);
  return l < 4 ? "Easy" : l < 7 ? "Medium" : "Hard";
}

// "Difficulty 4 · Medium", shown on a result.
export function difficultyLabel(level: number): string {
  return `Difficulty ${Math.floor(clampLevel(level))} · ${bandOf(level)}`;
}

// --- Takes (6.7: easy prompts, 28 s prep, 55 s long → hard prompts, 5 s prep,
// 145 s long; at the top, surprise prompts with no prep) -----------------------

const PREP_EASY = 28;
const PREP_HARD = 5;
const LENGTH_EASY = 55;
const LENGTH_HARD = 145;
const SPAN = MAX_LEVEL - MIN_LEVEL - 1; // levels 1 to 9 spread the prep; 10 has none

export function takeTier(level: number): DifficultyTier {
  const band = bandOf(level);
  return band === "Easy" ? "easy" : band === "Medium" ? "medium" : "hard";
}

export function takePrepSeconds(level: number): number {
  const l = clampLevel(level);
  if (l >= MAX_LEVEL) return 0;
  return Math.round(PREP_EASY - ((l - MIN_LEVEL) / SPAN) * (PREP_EASY - PREP_HARD));
}

export function takeDurationSeconds(level: number): number {
  const l = clampLevel(level);
  // Rounded to 5 s, the length slider's step.
  return Math.round((LENGTH_EASY + ((l - MIN_LEVEL) / (MAX_LEVEL - MIN_LEVEL)) * (LENGTH_HARD - LENGTH_EASY)) / 5) * 5;
}

// At the top a take is a surprise: no prep at all.
export const isSurprise = (level: number): boolean => clampLevel(level) >= MAX_LEVEL;

const TIER_LEVEL: Record<DifficultyTier, number> = { easy: 2, medium: 5, hard: 8 };

// A take's difficulty from what it actually was (6.7, "takes you choose
// yourself"): the average of what its prompt tier, its prep and its length each
// say. A part that isn't known is left out; with none known, it's 1.
export function takeDifficultyOf(take: { tier: DifficultyTier | null; prepSeconds: number | null; durationSeconds: number | null }): number {
  const parts: number[] = [];
  if (take.tier) parts.push(TIER_LEVEL[take.tier]);
  if (take.prepSeconds != null) {
    parts.push(take.prepSeconds <= 0 ? MAX_LEVEL : clampLevel(MIN_LEVEL + ((PREP_EASY - take.prepSeconds) / (PREP_EASY - PREP_HARD)) * SPAN));
  }
  if (take.durationSeconds != null && take.durationSeconds > 0) {
    parts.push(clampLevel(MIN_LEVEL + ((take.durationSeconds - LENGTH_EASY) / (LENGTH_HARD - LENGTH_EASY)) * (MAX_LEVEL - MIN_LEVEL)));
  }
  if (!parts.length) return MIN_LEVEL;
  return Math.round((parts.reduce((s, p) => s + p, 0) / parts.length) * 10) / 10;
}

// The warm-up before a take grows with its difficulty.
export function warmUpIntensityFor(level: number): WarmUpIntensity {
  const band = bandOf(level);
  return band === "Easy" ? "short" : band === "Medium" ? "medium" : "long";
}

// The prompt pool for a tier, widened to the next tier when it's too small, and
// to everything if even that is empty. MIN_POOL stays above the last-20 repeat
// window so the filter can't defeat itself.
export const MIN_TIER_POOL_SIZE = 15;

export function filterPromptsByTier(prompts: Prompt[], tier: DifficultyTier, minPoolSize = MIN_TIER_POOL_SIZE): Prompt[] {
  const exact = prompts.filter((p) => p.difficultyTier === tier);
  if (exact.length >= minPoolSize) return exact;
  const adjacent: DifficultyTier[] = tier === "medium" ? ["easy", "hard"] : ["medium"];
  const widened = prompts.filter((p) => p.difficultyTier === tier || (p.difficultyTier && adjacent.includes(p.difficultyTier)));
  return widened.length > 0 ? widened : prompts;
}

export function tierLabel(tier: DifficultyTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}
