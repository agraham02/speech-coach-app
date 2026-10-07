import type { SkillId } from "../../theme/tokens";
import type { DifficultyTier } from "../sessionTypes";

// Every drill type: which skill it trains, how its knobs scale with the
// adaptive difficulty level (1-10, see mastery.ts), and how a result maps to
// a 0-1 score plus pass/fail. Pure — the screens only measure and display.

export type DrillType =
  | "twister"
  | "minimal_pairs"
  | "pace_reading"
  | "pause_reading"
  | "category_fluency"
  | "letter_fluency"
  | "random_word_story"
  | "just_a_minute"
  | "shadowing"
  | "projection"
  | "guided"
  | "warmup"
  | "rep";

export const DRILL_SKILL: Record<DrillType, SkillId> = {
  twister: "articulation",
  minimal_pairs: "articulation",
  pace_reading: "cadence",
  pause_reading: "cadence",
  shadowing: "cadence",
  category_fluency: "impromptu",
  letter_fluency: "impromptu",
  random_word_story: "impromptu",
  just_a_minute: "impromptu",
  projection: "confidence",
  guided: "confidence",
  warmup: "confidence",
  rep: "impromptu",
};

export const DRILL_TITLES: Record<DrillType, string> = {
  twister: "Tongue twister",
  minimal_pairs: "Minimal pairs",
  pace_reading: "Pace reading",
  pause_reading: "Pause reading",
  category_fluency: "Category sprint",
  letter_fluency: "Letter sprint",
  random_word_story: "Random-word story",
  just_a_minute: "Just a Minute",
  shadowing: "Shadowing",
  projection: "Projection",
  guided: "Guided exercise",
  warmup: "Warm-up",
  rep: "Impromptu rep",
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lvl = (level: number) => clamp(Math.round(level), 1, 10);

export function tierForLevel(level: number): DifficultyTier {
  const l = lvl(level);
  return l <= 3 ? "easy" : l <= 6 ? "medium" : "hard";
}

export function contentLevel(level: number): 1 | 2 | 3 {
  const l = lvl(level);
  return l <= 3 ? 1 : l <= 7 ? 2 : 3;
}

// ---------------------------------------------------------------------------
// Knobs
// ---------------------------------------------------------------------------

export interface DrillParams {
  // seconds the drill listens for (timed drills)
  seconds?: number;
  // target count (fluency) or number of items (minimal pairs, story words)
  target?: number;
  // pace band (pace reading)
  wpmMin?: number;
  wpmMax?: number;
  // minimum pause length that counts (pause reading)
  minPauseMs?: number;
  // twister speed ladder
  targetWpm?: number;
  // allowed slips (just a minute)
  allowedHesitations?: number;
  // projection meter target (-2..10 native scale)
  volumeTarget?: number;
  // impromptu rep
  prepSeconds?: number;
  tier?: DifficultyTier;
}

export function paramsFor(type: DrillType, level: number): DrillParams {
  const l = lvl(level);
  switch (type) {
    case "twister":
      return { tier: tierForLevel(l), targetWpm: l >= 5 ? 90 + l * 10 : undefined };
    case "minimal_pairs":
      return { target: Math.min(14, 6 + l) };
    case "pace_reading": {
      const half = Math.max(10, 30 - l * 2);
      return { wpmMin: 145 - half, wpmMax: 145 + half };
    }
    case "pause_reading":
      return { minPauseMs: 250 + l * 40 };
    case "category_fluency":
      return { seconds: l <= 4 ? 30 : l <= 7 ? 45 : 60, target: Math.round(6 + l * 1.5) };
    case "letter_fluency":
      return { seconds: l <= 4 ? 30 : l <= 7 ? 45 : 60, target: 5 + l };
    case "random_word_story":
      return { target: 2 + Math.floor(l / 4), seconds: 30 + l * 5, prepSeconds: Math.max(0, Math.round(15 - l * 1.5)) };
    case "just_a_minute":
      return { seconds: Math.min(75, 30 + l * 5), allowedHesitations: Math.max(0, 3 - Math.floor(l / 3)) };
    case "shadowing":
      return { target: 80 };
    case "projection":
      return { volumeTarget: Math.min(8, 2 + l * 0.5), seconds: 10 + l };
    case "rep":
      return {
        tier: tierForLevel(l),
        prepSeconds: Math.max(5, Math.round(30 - l * 2.5)),
        seconds: Math.min(150, 45 + l * 10),
      };
    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface DrillOutcome {
  score: number; // 0-1
  success: boolean;
  summary: string;
}

const SUCCESS = 0.8;

function outcome(score: number, summary: string, success = score >= SUCCESS): DrillOutcome {
  return { score: Math.round(clamp(score, 0, 1) * 100) / 100, success, summary };
}

export function scoreAccuracy(accuracyPercent: number, wpm?: number, targetWpm?: number): DrillOutcome {
  const acc = accuracyPercent / 100;
  if (targetWpm && wpm != null) {
    const speedOk = wpm >= targetWpm;
    const score = acc * (speedOk ? 1 : Math.max(0.5, wpm / targetWpm));
    return outcome(score, `${accuracyPercent}% clear at ${wpm} wpm (target ${targetWpm}+)`, acc >= SUCCESS && speedOk);
  }
  return outcome(acc, `${accuracyPercent}% clear`);
}

export function scorePace(wpm: number, accuracyPercent: number, p: DrillParams): DrillOutcome {
  const min = p.wpmMin ?? 120;
  const max = p.wpmMax ?? 170;
  const inBand = wpm >= min && wpm <= max;
  const distance = inBand ? 0 : wpm < min ? min - wpm : wpm - max;
  const paceScore = Math.max(0, 1 - distance / 40);
  const score = paceScore * 0.7 + (accuracyPercent / 100) * 0.3;
  return outcome(score, `${wpm} wpm (target ${min}–${max})`, inBand && accuracyPercent >= 70);
}

export function scorePauses(pausesFound: number, marks: number): DrillOutcome {
  const ratio = marks > 0 ? Math.min(1, pausesFound / marks) : 0;
  return outcome(ratio, `${Math.min(pausesFound, marks)} of ${marks} pauses held`);
}

export function scoreCount(count: number, target: number, unit: string): DrillOutcome {
  return outcome(count / Math.max(target, 1), `${count} ${unit} (target ${target})`, count >= target);
}

export function scoreStory(wordsUsed: number, wordsRequired: number, spokeRatio: number): DrillOutcome {
  const score = (wordsUsed / Math.max(wordsRequired, 1)) * 0.7 + Math.min(1, spokeRatio) * 0.3;
  return outcome(score, `${wordsUsed} of ${wordsRequired} words worked in`, wordsUsed === wordsRequired && spokeRatio >= 0.6);
}

export function scoreJustAMinute(hesitations: number, fillers: number, allowed: number, spokeRatio: number): DrillOutcome {
  const slips = hesitations + fillers;
  const score = Math.max(0, 1 - Math.max(0, slips - allowed) * 0.2) * Math.min(1, spokeRatio / 0.7);
  return outcome(score, `${hesitations} long hesitations, ${fillers} fillers (allowed ${allowed})`, slips <= allowed && spokeRatio >= 0.6);
}

export function scoreProjection(fractionAbove: number): DrillOutcome {
  return outcome(fractionAbove / 0.8, `${Math.round(fractionAbove * 100)}% of speech at target volume`, fractionAbove >= 0.7);
}

export function scoreSelfRating(rating: number): DrillOutcome {
  return outcome(rating / 5, `Self-rated ${rating}/5`, rating >= 4);
}
