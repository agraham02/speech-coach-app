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
  | "word_chain"
  | "chain_bridge"
  | "shadowing"
  | "projection"
  | "guided"
  | "warmup"
  | "rep"
  // Conversation: a spoken partner line, then your reply (see
  // domain/conversation). Each has its own staircase.
  | "conv_reply"
  | "conv_beat"
  | "conv_thread"
  | "conv_held"
  | "conv_outsider"
  | "conv_echo"
  | "conv_group"
  | "conv_replay"
  | "land_plane"
  | "squeeze"
  | "callback"
  | "conv_react";

export const CONVERSATION_DRILLS = [
  "conv_reply",
  "conv_beat",
  "conv_thread",
  "conv_held",
  "conv_outsider",
  "conv_echo",
  "conv_group",
  "conv_replay",
  "land_plane",
  "squeeze",
  "callback",
  "conv_react",
] as const satisfies readonly DrillType[];

export type ConversationDrillType = (typeof CONVERSATION_DRILLS)[number];

export function isConversationDrill(type: DrillType): type is ConversationDrillType {
  return (CONVERSATION_DRILLS as readonly DrillType[]).includes(type);
}

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
  word_chain: "impromptu",
  chain_bridge: "impromptu",
  projection: "confidence",
  guided: "confidence",
  warmup: "confidence",
  rep: "impromptu",
  conv_reply: "conversation",
  conv_beat: "conversation",
  conv_thread: "conversation",
  conv_held: "conversation",
  conv_outsider: "conversation",
  conv_echo: "conversation",
  conv_group: "conversation",
  conv_replay: "conversation",
  land_plane: "conversation",
  squeeze: "conversation",
  callback: "conversation",
  conv_react: "conversation",
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
  word_chain: "Word chain",
  chain_bridge: "Bridge chain",
  shadowing: "Shadowing",
  projection: "Projection",
  guided: "Guided exercise",
  warmup: "Warm-up",
  rep: "Impromptu rep",
  conv_reply: "Reply window",
  conv_beat: "Take a beat",
  conv_thread: "Ask about it",
  conv_held: "Hold one word",
  conv_outsider: "Curious outsider",
  conv_echo: "Echo – Ask – Add",
  conv_group: "Join the group",
  conv_replay: "Replay a blank",
  land_plane: "Land the plane",
  squeeze: "Squeeze it",
  callback: "Call it back",
  conv_react: "React",
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
  // word chain: silence (s) before a fresh seed word appears
  stallSeconds?: number;
  // projection meter target (-2..10 native scale)
  volumeTarget?: number;
  // impromptu rep
  prepSeconds?: number;
  tier?: DifficultyTier;
  // conversation: how long after the partner stops a reply still counts as
  // "in the window" (never a penalty for replying fast)
  replyWindowSec?: number;
  // conversation: silent wait before the mic opens (hold one word)
  holdSeconds?: number;
  // conversation: Echo – Ask – Add beats needed to pass
  requiredBeats?: number;
  // conversation: partner turns in a group / multi-turn drill
  turns?: number;
  // land the plane / squeeze: time budget per answer
  budgetSeconds?: number;
  // squeeze: share of the short take's content words drawn from the long one
  retentionTarget?: number;
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
    // More links in less forgiving silence. Level 1 asks for 8 links in 30 s
    // with a 3 s grace before a fresh word; level 10, 25 links in 60 s.
    case "word_chain":
      return {
        seconds: l <= 3 ? 30 : l <= 6 ? 45 : 60,
        target: Math.round(6 + l * 1.9),
        stallSeconds: l <= 3 ? 3 : l <= 6 ? 2.5 : l <= 8 ? 2 : 1.5,
      };
    // Each link comes with its reason, so far fewer of them — and a longer
    // grace, since explaining takes thought.
    case "chain_bridge":
      return { seconds: l <= 4 ? 45 : 60, target: 3 + Math.floor(l / 2), stallSeconds: l <= 5 ? 4 : 3 };
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
    // Conversation knobs only ever ask for a reply sooner or a little more of
    // it — never for a "better" reply. Level 1 is deliberately generous.
    case "conv_reply":
    case "conv_replay":
    case "conv_thread":
    case "conv_outsider":
      return { replyWindowSec: Math.round((6.4 - l * 0.4) * 10) / 10 };
    case "conv_held":
      return { replyWindowSec: 6, holdSeconds: Math.round(4 + l * 0.6) };
    case "conv_echo":
      return { replyWindowSec: 6, requiredBeats: l <= 4 ? 2 : 3 };
    case "conv_group":
      return { replyWindowSec: Math.round((6.4 - l * 0.3) * 10) / 10, turns: Math.min(4, 2 + Math.floor(l / 4)) };
    case "land_plane":
      return { budgetSeconds: Math.round(48 - l * 2.8) };
    case "squeeze":
      return { retentionTarget: Math.round((0.25 + l * 0.02) * 100) / 100 };
    case "callback":
      return { replyWindowSec: 8 };
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

export function outcome(score: number, summary: string, success = score >= SUCCESS): DrillOutcome {
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

// Each fresh start after the first costs a little — blanking happens, and
// picking the chain back up is the point, so it's never a big penalty.
const RESET_COST = 0.05;

export function scoreChain(links: number, target: number, resets: number, penalizeResets = true): DrillOutcome {
  const cost = penalizeResets ? Math.max(0, resets - 1) * RESET_COST : 0;
  const starts = resets === 1 ? " · 1 fresh start" : resets > 1 ? ` · ${resets} fresh starts` : "";
  return outcome(Math.min(1, links / Math.max(target, 1)) - cost, `${links} links (target ${target})${starts}`);
}

export function scoreBridges(bridges: number, target: number, resets: number, penalizeResets = true): DrillOutcome {
  const cost = penalizeResets ? Math.max(0, resets - 1) * RESET_COST : 0;
  return outcome(Math.min(1, bridges / Math.max(target, 1)) - cost, `${bridges} links explained (target ${target})`);
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
