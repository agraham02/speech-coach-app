import { weekStart } from "../feelings";

// The challenge setting and the weekly Stretch rep (docs/overhaul/PLAN.md, 6.7,
// rules 7 and 11). Pure.
//
// Challenge: how often you succeed where the staircase settles. Gentle aims for
// 90% success, Standard 82% (the default, the "85% rule" sweet spot), Push me
// 70%. It changes the staircase's step sizes (mastery.ts, nextDifficulty).
//
// Stretch: once a week, one attempt runs 2 levels above you. A good result
// counts 1.5 times; a miss can't lower anything, so reaching is safe.

export type Challenge = "gentle" | "standard" | "push";

export const CHALLENGE_TARGET: Record<Challenge, number> = { gentle: 0.9, standard: 0.82, push: 0.7 };

export const CHALLENGE_OPTIONS: { key: Challenge; label: string; detail: string }[] = [
  { key: "gentle", label: "Gentle", detail: "You'll succeed about 9 times in 10" },
  { key: "standard", label: "Standard", detail: "About 8 in 10: hard enough to keep growing" },
  { key: "push", label: "Push me", detail: "About 7 in 10: more misses, faster climbing" },
];

export const STRETCH_LEVELS = 2;
export const STRETCH_BONUS = 1.5;

// Due when no Stretch rep has been done this week (weeks start on Monday).
export function stretchDue(lastStretchWeek: string | null, today: string): boolean {
  return lastStretchWeek !== weekStart(today);
}

export const stretchWeekOf = (today: string): string => weekStart(today);
