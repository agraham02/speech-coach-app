import { MAX_LEVEL, MIN_LEVEL } from "../mastery";
import type { WarmUpTargets } from "../warmups/warmUpMeasures";

// What gets harder in the activities that had no difficulty before
// (docs/overhaul/PLAN.md, 6.7's table, task 3d.5). Each runs on its own
// staircase now, and these turn its level into the bar it's held to. All of
// these ranges are the plan's starting points, to check against real success
// rates. Pure.

// 0 at the easiest level, 1 at the hardest.
const along = (level: number) => (Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, level)) - MIN_LEVEL) / (MAX_LEVEL - MIN_LEVEL);
const between = (from: number, to: number, level: number) => from + (to - from) * along(level);

// --- Guided exercises: Rate contrast 1.3 → 1.8 times, Power pause 1 → 3 s.
export interface GuidedKnobs {
  // The fast telling over the slow one, for full marks.
  rateRatioFull: number;
  // A held silence this long counts (90% of the asked-for hold, for timing slop).
  holdMs: number;
}

export function guidedKnobs(level: number): GuidedKnobs {
  return {
    rateRatioFull: Math.round(between(1.3, 1.8, level) * 100) / 100,
    holdMs: Math.round(0.9 * between(1000, 3000, level)),
  };
}

// --- Warm-ups: hiss 10 → 25 s, a faster pa-ta-ka, a wider siren, more rounds.
export function warmUpTargets(level: number): WarmUpTargets {
  return {
    hissSeconds: Math.round(between(10, 25, level)),
    patakaRate: Math.round(between(5, 7, level) * 10) / 10,
    sirenSemitones: Math.round(between(12, 18, level)),
  };
}

// A breathing warm-up's rounds: one more every three levels.
export function breathRounds(baseRounds: number, level: number): number {
  return baseRounds + Math.floor((Math.max(MIN_LEVEL, level) - MIN_LEVEL) / 3);
}

// --- Rewind: 60 → 120 s, and more details a minute for full marks.
export function rewindTargets(level: number): { targetSeconds: number; detailsFull: number } {
  return { targetSeconds: Math.round(between(60, 120, level) / 5) * 5, detailsFull: Math.round(between(4, 6, level) * 10) / 10 };
}
