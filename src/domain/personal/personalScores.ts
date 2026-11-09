import type { LeafEvidence } from "../scoring/leafEvidence";
import type { LeafId } from "../scoring/skillTree";
import { takeLeafReadings, type TakeFacts } from "../scoring/takeLeaves";
import { computeFillerStats } from "../transcriptAnnotations";
import { partsCovered, type RewindStats } from "../rewind/stats";
import type { EventKind } from "../profile";
import type { TimedWordInput } from "../drills/timedHeard";

// The personal and real-world activities get numbers (docs/overhaul/PLAN.md,
// section 7, "Personal and real-world", and the leaf rules in 6.2's Composure
// table). Most of these are your own count or your own rating, so they move only
// inner leaves; Rewind also hears how you spoke. Every weight and cut-off is the
// plan's, and the ones it marks "tune" are first guesses. Pure.

export type LeafScores = Partial<Record<LeafId, LeafEvidence>>;

export interface PersonalScore {
  // 0-1, the attempt's number; null when nothing was done.
  score: number | null;
  // What each leaf gets. A self-report is marked so, and moves inner leaves only.
  leafScores: LeafScores;
  // One line per part, for the result or the toast.
  parts: string[];
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const r2 = (x: number) => Math.round(x * 100) / 100;
const filled = (s: string | null | undefined) => !!s && s.trim().length > 1;
const none: PersonalScore = { score: null, leafScores: {}, parts: [] };

// --- Rewind -------------------------------------------------------------------

// Details a minute for full marks on that part (tune).
export const REWIND_DETAILS_FULL = 4;
// A gap this long in the middle of a sentence is a stall, as on a take.
export const STALL_GAP_MS = 2000;

// Stalls from Whisper's word times: a gap of 2 seconds or more where the word
// before doesn't end a sentence or clause.
export function wordStalls(words: TimedWordInput[] | null): number | null {
  if (!words?.length) return null;
  let stalls = 0;
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].startMs - words[i - 1].endMs;
    if (gap >= STALL_GAP_MS && !/[.!?,;:]["')]*$/.test(words[i - 1].text.trim())) stalls += 1;
  }
  return stalls;
}

// Parts of the day ÷ 3 (40), details a minute (40), talk time (20). Moves
// Specifics, a phone estimate of what you said; with the Settings switch on, your
// ums, "like"s and stalls move lightly too, as they do on a take.
export function rewindScore(input: {
  stats: RewindStats;
  transcript: string;
  words: TimedWordInput[] | null;
  targetSeconds: number;
  // Details a minute for full marks on that part; rises with the Rewind's level.
  detailsFull?: number;
  delivery: boolean;
  stutterMode: boolean;
}): PersonalScore {
  const { stats } = input;
  if (stats.words < 20) return { ...none, parts: ["Too little was heard to count."] };
  const minutes = Math.max(stats.seconds / 60, 0.5);
  const parts = partsCovered(stats.coverage);
  const detailsPerMinute = stats.details.total / minutes;
  const score = r2(0.4 * (parts / 3) + 0.4 * clamp01(detailsPerMinute / (input.detailsFull ?? REWIND_DETAILS_FULL)) + 0.2 * clamp01(stats.seconds / input.targetSeconds));
  const leafScores: LeafScores = { specifics: { score, source: "phone_estimate" } };
  const lines = [`${parts} of 3 parts of the day`, `${Math.round(detailsPerMinute * 10) / 10} details a minute`, `${stats.seconds} of ${input.targetSeconds} seconds`];
  if (input.delivery && !input.stutterMode) {
    const typed = computeFillerStats(input.transcript, stats.seconds);
    const facts = { ...EMPTY_FACTS, durationSeconds: stats.seconds, wordCount: stats.words, fillers: { hesitationPerMinute: typed.hesitation.ratePerMinute, contextualPerMinute: typed.contextual.ratePerMinute }, stalls: wordStalls(input.words) };
    const readings = takeLeafReadings(facts);
    for (const leaf of ["ums_uhs", "like_actually", "stalls"] as const) {
      const reading = readings[leaf];
      if (reading) leafScores[leaf] = { score: clamp01(reading.score / 100), source: "measured" };
    }
  }
  return { score, leafScores, parts: lines };
}

const EMPTY_FACTS: TakeFacts = {
  kind: "impromptu",
  durationSeconds: 0,
  wordCount: 0,
  wpm: null,
  paceSdSylPerSec: null,
  paceDriftPercent: null,
  boundaryPauseRate: null,
  pitchPhraseSdSt: null,
  endings: null,
  standOut: null,
  strongOnContentShare: null,
  lastWordCarry: null,
  fillers: null,
  stalls: null,
  restarts: null,
  readAccuracyPercent: null,
  presence: null,
  hedges: null,
  ending: null,
  pointFirst: null,
  structure: null,
  wordsPerSentence: null,
  longWordShare: null,
  detoursPerMinute: null,
  detailsPerMinute: null,
  secondsToFirstWord: null,
};

// --- Inner voice -------------------------------------------------------------

// Three things: different items ÷ the day's aim (50), said aloud (50).
export function threeThingsScore(input: { distinctItems: number; said: number; aim: number }): PersonalScore {
  if (input.aim <= 0 || input.distinctItems <= 0) return none;
  const items = clamp01(input.distinctItems / input.aim);
  const said = clamp01(input.said / input.aim);
  const score = r2(0.5 * items + 0.5 * said);
  return { score, leafScores: { self_kindness: { score, source: "self" } }, parts: [`${Math.min(input.distinctItems, input.aim)} of ${input.aim} written`, `${Math.min(input.said, input.aim)} said aloud`] };
}

// Talk back: steps ÷ 6 (40), belief drop (40), fairer line said (20). A drop of
// two points on the 1-5 scale is full marks, one is half.
export function talkBackScore(input: { before: number | null; after: number | null; forText: string; againstText: string; balanced: string; said: boolean }): PersonalScore {
  if (input.before == null) return none;
  const steps = 1 + Number(filled(input.forText)) + Number(filled(input.againstText)) + Number(filled(input.balanced)) + Number(input.said) + Number(input.after != null);
  const drop = input.after == null ? 0 : clamp01((input.before - input.after) / 2);
  const score = r2(0.4 * (steps / 6) + 0.4 * drop + 0.2 * Number(input.said));
  const parts = [`${steps} of 6 steps`, input.after == null ? "No rating after" : `Felt true: ${input.before} then ${input.after}`, input.said ? "Fairer line said" : "Fairer line not said"];
  return { score, leafScores: { reframing: { score, source: "self" } }, parts };
}

// --- Nerves, forecasts and real moments ---------------------------------------

// Actual at or under what you predicted is full marks; each point over on a
// 0-10 scale costs a fifth.
export function forecastGapScore(predicted: number | null, actual: number | null, range = 10): number | null {
  if (predicted == null || actual == null) return null;
  return actual <= predicted ? 1 : r2(clamp01(1 - ((actual - predicted) / range) * 2));
}

// Nerves compared with your start: 0.5 is where you began, 1 is the best the
// scale allows, 0 the worst. `lowerIsBetter` for nerves, not for comfort.
export function nervesTrendScore(now: number, start: number, range: number, lowerIsBetter: boolean): number {
  const better = lowerIsBetter ? start - now : now - start;
  return r2(clamp01(0.5 + better / (2 * range)));
}

// How hard each kind of moment is (plan 6.7): real-world reps carry this
// difficulty, so small talk alone can't max them out.
export const MOMENT_DIFFICULTY: Record<EventKind | "small_talk", number> = {
  small_talk: 2,
  other: 3,
  date: 5,
  toast: 6,
  pitch: 7,
  talk: 7,
  interview: 8,
};

const OPEN_STARTS = /^(what|how|why|tell me|describe|explain|what's|whats)\b/i;
export const isOpenQuestion = (q: string): boolean => OPEN_STARTS.test(q.trim());

// Prime: fields filled ÷ 6 (three topics, two questions, a focus); the share of
// your questions that are open ones moves Open questions lightly. Forecast gap
// waits for the debrief, when there is an actual to compare.
export function primeScore(input: { topics: string[]; questions: string[]; goal: string | null }): PersonalScore {
  const fields = input.topics.filter(filled).length + input.questions.filter(filled).length + Number(filled(input.goal));
  if (!fields) return none;
  const score = r2(clamp01(fields / 6));
  const asked = input.questions.filter(filled);
  const leafScores: LeafScores = {};
  if (asked.length) leafScores.open_questions = { score: asked.filter(isOpenQuestion).length / asked.length, source: "measured" };
  return { score, leafScores, parts: [`${fields} of 6 filled`, asked.length ? `${asked.filter(isOpenQuestion).length} of ${asked.length} questions open` : "No questions written"] };
}

// Debrief: you went and did it (Real-world reps), and how it compared with
// your forecast. The fields filled are the number.
export function debriefScore(input: { predicted: number | null; actual: number | null; wentOkay: string; tryNext: string; positiveSign: string; blanksNamed: number }): PersonalScore {
  const fields = Number(filled(input.wentOkay)) + Number(filled(input.tryNext)) + Number(filled(input.positiveSign)) + Number(input.actual != null);
  const score = r2(0.5 + 0.5 * (fields / 4));
  const leafScores: LeafScores = { real_world: { score: 1, source: "self" } };
  const gap = forecastGapScore(input.predicted, input.actual);
  if (gap != null) leafScores.forecast_gap = { score: gap, source: "self" };
  const parts = [`${fields} of 4 filled`];
  if (input.blanksNamed) parts.push(`${input.blanksNamed} blank ${input.blanksNamed === 1 ? "moment" : "moments"} named`);
  return { score, leafScores, parts };
}

// A Moment, before: nerves and a focus written. Nerves move their trend lightly.
export function momentBeforeScore(input: { nerves: number | null; focus: string; nervesStart: number | null }): PersonalScore {
  if (input.nerves == null && !filled(input.focus)) return none;
  const score = r2(0.5 * Number(input.nerves != null) + 0.5 * Number(filled(input.focus)));
  const leafScores: LeafScores = {};
  if (input.nerves != null) leafScores.nerves_trend = { score: nervesTrendScore(input.nerves, input.nervesStart ?? input.nerves, 10, true), source: "self" };
  return { score, leafScores, parts: [] };
}

// A Moment, after: you did it, your nerves against your start and your forecast.
export function momentAfterScore(input: {
  nerves: number | null;
  forecast: number | null;
  nervesStart: number | null;
  went: number | null;
  focusResult: string | null;
  wentOkay: string;
  tryNext: string;
}): PersonalScore {
  const fields = Number(input.nerves != null) + Number(input.went != null) + Number(input.focusResult != null) + Number(filled(input.wentOkay)) + Number(filled(input.tryNext));
  const score = r2(0.5 + 0.5 * (fields / 5));
  const leafScores: LeafScores = { real_world: { score: 1, source: "self" } };
  if (input.nerves != null) leafScores.nerves_trend = { score: nervesTrendScore(input.nerves, input.nervesStart ?? input.nerves, 10, true), source: "self" };
  const gap = forecastGapScore(input.forecast, input.nerves);
  if (gap != null) leafScores.forecast_gap = { score: gap, source: "self" };
  return { score, leafScores, parts: [] };
}

// The monthly comfort check-in, 1 to 5, against your first.
export function comfortScore(rating: number, firstRating: number | null): PersonalScore {
  const score = nervesTrendScore(rating, firstRating ?? rating, 4, false);
  return { score, leafScores: { nerves_trend: { score, source: "self" } }, parts: [] };
}

// Attention on yourself, 0-10, before and after a conversation drill: a drop is
// full marks, no change half, a rise none.
export function attentionScore(before: number | null, after: number | null): PersonalScore {
  if (before == null || after == null) return none;
  const score = after < before ? 1 : after === before ? 0.5 : 0;
  return { score, leafScores: { outward_focus: { score, source: "self" } }, parts: [] };
}

// Plan your point: fields filled ÷ 3 (point, reason, example). A sketch is
// evidence of a shape, so it moves Has a shape lightly, as a phone estimate.
export function planPointScore(fields: { point: string; reason: string; example: string }): PersonalScore {
  const n = Number(filled(fields.point)) + Number(filled(fields.reason)) + Number(filled(fields.example));
  if (!n) return none;
  const score = r2(n / 3);
  return { score, leafScores: { has_shape: { score, source: "phone_estimate" } }, parts: [] };
}

// Rehearse: the share of the speech's words the live follow-along heard.
export function followedScore(followed: number, total: number): PersonalScore {
  if (total <= 0 || followed <= 0) return none;
  const score = r2(clamp01(followed / total));
  return { score, leafScores: { read_accuracy: { score, source: "measured" } }, parts: [] };
}

// Missions: logged ÷ target.
export function missionScore(count: number, target: number): PersonalScore {
  if (target <= 0 || count <= 0) return none;
  const score = r2(clamp01(count / target));
  return { score, leafScores: { missions: { score, source: "self" } }, parts: [] };
}
