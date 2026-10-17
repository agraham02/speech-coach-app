import type { SkillId } from "../theme/tokens";
import { SKILLS } from "./mastery";
import { paceScore, fillerScore } from "./sessionScore";
import type { Obstacle } from "./profile";
import { REVIEW_SHARE } from "./repEvidence";
import type { CloudSource } from "./sessionScore";

// The onboarding skill check: four short pieces that together touch all
// five skills, turned into a starting rating per skill (15-45 on the
// 0-100 mastery scale, around the default 25), plus plain-words strengths
// and focus areas. Judgment calls throughout, not calibrated against real
// outcomes — one short sample is noisy, so it only nudges where you start
// and which skills get attention first; the levels themselves still start
// at the bottom. Pure.

export interface SkillCheckInput {
  // Read-aloud passage
  readAccuracy?: number | null; // 0-100
  readWpm?: number | null;
  // Category sprint
  categoryCount?: number | null;
  categoryTarget?: number | null;
  // One partner line, then your reply
  replyLatencyMs?: number | null;
  askedBack?: boolean | null;
  // The topic recording (on-device analysis)
  talkSeconds?: number | null;
  talkWpm?: number | null;
  fillerRatePerMinute?: number | null;
  boundaryPauseRate?: number | null;
  hesitations?: number | null;
  pitchRangeHz?: number | null;
  eyeContactPercent?: number | null;
  expressiveness?: number | null;
  hedgeCount?: number | null;
  strongEnding?: boolean | null;
  structured?: boolean | null;
  // A deep review of the topic recording, 0-10 per skill it can judge (see
  // domain/repEvidence.ts). It leads where it exists, by more when the
  // reviewer watched the video.
  review?: { cadence?: number | null; impromptu?: number | null; confidence?: number | null; source: CloudSource } | null;
  // Self-report from onboarding (blended in where measurement is thin)
  obstacles?: Obstacle[];
  // Stuttering: fillers and hesitations aren't measured against you.
  stutterMode?: boolean;
}

const REVIEWED: { skill: "cadence" | "impromptu" | "confidence"; what: string }[] = [
  { skill: "cadence", what: "pace, pitch and pauses" },
  { skill: "impromptu", what: "the shape and relevance of your answer" },
  { skill: "confidence", what: "eye contact, expression and volume" },
];

export interface SkillResult {
  skill: SkillId;
  // 0-10, null when nothing measured it
  score: number | null;
  // Seed for mastery (0-100), null to leave the default
  rating: number | null;
  // Plain-words evidence for the strengths / focus lists
  good: string[];
  work: string[];
}

export interface SkillCheckResult {
  skills: Record<SkillId, SkillResult>;
  strengths: { skill: SkillId; text: string }[];
  focus: { skill: SkillId; text: string }[];
  // 1-5, to set against how you felt it went
  observed: number | null;
}

const clamp10 = (n: number) => Math.max(0, Math.min(10, n));
const mean = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

// 0-10 → a starting rating of 15-45.
export function ratingFromScore(score: number | null): number | null {
  return score == null ? null : Math.round(15 + (clamp10(score) / 10) * 30);
}

const SELF_REPORT: Partial<Record<SkillId, Obstacle[]>> = {
  conversation: ["ramble", "blank"],
};

export function evaluateSkillCheck(input: SkillCheckInput): SkillCheckResult {
  const results = Object.fromEntries(SKILLS.map((s) => [s, { skill: s, score: null, rating: null, good: [], work: [] }])) as unknown as Record<SkillId, SkillResult>;
  const add = (skill: SkillId, part: "good" | "work", text: string) => results[skill][part].push(text);

  // --- articulation: did the words come out clearly enough to be recognized?
  if (input.readAccuracy != null) {
    const s = clamp10(((input.readAccuracy - 60) / 40) * 10);
    results.articulation.score = s;
    if (input.readAccuracy >= 90) add("articulation", "good", `${Math.round(input.readAccuracy)}% of the passage came through word for word — clear speech.`);
    else if (input.readAccuracy < 80) add("articulation", "work", `About ${Math.round(100 - input.readAccuracy)}% of the passage got lost — finishing word endings will help.`);
  }

  // --- cadence: pace, pauses at sentence ends, pitch movement
  const pace = input.talkWpm ?? input.readWpm ?? null;
  const paceS = pace != null ? paceScore(pace) : null;
  const pauseS = input.boundaryPauseRate != null ? clamp10((input.boundaryPauseRate / 0.6) * 10) : null;
  const pitchS = input.pitchRangeHz != null ? clamp10((input.pitchRangeHz / 110) * 10) : null;
  results.cadence.score = mean([paceS, pauseS, pitchS]);
  if (pace != null) {
    if (pace > 175) add("cadence", "work", `You spoke at about ${Math.round(pace)} words a minute — fast enough that people strain to keep up.`);
    else if (pace >= 125 && pace <= 165) add("cadence", "good", `A pace people can follow (about ${Math.round(pace)} words a minute).`);
  }
  if (input.boundaryPauseRate != null) {
    if (input.boundaryPauseRate >= 0.6) add("cadence", "good", "You paused at most full stops — that's rarer than you'd think.");
    else if (input.boundaryPauseRate < 0.3) add("cadence", "work", "Sentences ran into each other — a beat at each full stop lets them land.");
  }
  if (input.pitchRangeHz != null && input.pitchRangeHz < 50) add("cadence", "work", "Your pitch stayed in a narrow band — more movement will carry more meaning.");

  // --- impromptu: retrieval speed, fillers, stalls
  const catS = input.categoryCount != null && input.categoryTarget ? clamp10((input.categoryCount / input.categoryTarget) * 8) : null;
  const fillS = !input.stutterMode && input.fillerRatePerMinute != null ? fillerScore(input.fillerRatePerMinute) : null;
  const stallS = !input.stutterMode && input.hesitations != null ? clamp10(10 - input.hesitations * 2) : null;
  const structS = input.structured == null ? null : input.structured ? 8 : 4;
  results.impromptu.score = mean([catS, fillS, stallS, structS]);
  if (input.categoryCount != null) {
    if (catS != null && catS >= 7) add("impromptu", "good", `${input.categoryCount} animals in 30 seconds — words come quickly for you.`);
    else if (catS != null && catS < 4) add("impromptu", "work", `${input.categoryCount} animals in 30 seconds — word retrieval is worth warming up.`);
  }
  if (!input.stutterMode && input.fillerRatePerMinute != null) {
    if (input.fillerRatePerMinute <= 3) add("impromptu", "good", "Very few filler words.");
    else if (input.fillerRatePerMinute > 6) add("impromptu", "work", `About ${Math.round(input.fillerRatePerMinute)} filler words a minute — a closed-mouth pause will do their job better.`);
  }
  if (input.structured === true) add("impromptu", "good", "Your answer had a clear shape.");

  // --- confidence: eye contact, a moving face, hedges, a clean ending
  const eyeS = input.eyeContactPercent != null ? clamp10((input.eyeContactPercent / 70) * 10) : null;
  const faceS = input.expressiveness != null ? clamp10(input.expressiveness / 6) : null;
  const hedgeS = input.hedgeCount != null && input.talkSeconds ? clamp10(10 - (input.hedgeCount / Math.max(1, input.talkSeconds / 60)) * 2) : null;
  const endS = input.strongEnding == null ? null : input.strongEnding ? 8 : 5;
  results.confidence.score = mean([eyeS, faceS, hedgeS, endS]);
  if (input.eyeContactPercent != null) {
    if (input.eyeContactPercent >= 65) add("confidence", "good", `You looked at the lens ${Math.round(input.eyeContactPercent)}% of the time — that reads as talking to someone.`);
    else if (input.eyeContactPercent < 40) add("confidence", "work", "Your eyes were away from the lens most of the time.");
  }
  if (input.strongEnding === true) add("confidence", "good", "You ended on a clear statement instead of trailing off.");
  if (input.hedgeCount != null && input.hedgeCount >= 4) add("confidence", "work", `${input.hedgeCount} hedges ("I think", "kind of") softened your points.`);

  // --- conversation: one reply's latency and whether you asked back, blended
  // with what you told us (thin evidence either way)
  const latS = input.replyLatencyMs != null ? clamp10(10 - Math.max(0, input.replyLatencyMs - 1500) / 600) : null;
  const askS = input.askedBack == null ? null : input.askedBack ? 9 : 5;
  const measured = mean([latS, askS]);
  const selfReported = (input.obstacles ?? []).some((o) => SELF_REPORT.conversation!.includes(o)) ? 3.5 : 6;
  results.conversation.score = measured == null ? null : (measured + selfReported) / 2;
  if (input.askedBack) add("conversation", "good", "You asked something back — that's what keeps a conversation going.");
  if (input.replyLatencyMs != null && input.replyLatencyMs > 4000) add("conversation", "work", "The reply took a while to start — that gap is exactly what the conversation drills shrink.");

  // --- the deep review leads where it judged something. Its line goes
  // first, so it's the one shown when the skill makes the short lists.
  if (input.review) {
    const share = REVIEW_SHARE[input.review.source];
    for (const { skill, what } of REVIEWED) {
      const reviewed = input.review[skill];
      if (reviewed == null || !Number.isFinite(reviewed)) continue;
      const local = results[skill].score;
      results[skill].score = local == null ? clamp10(reviewed) : local * (1 - share) + clamp10(reviewed) * share;
      const shown = Math.round(reviewed * 10) / 10;
      if (reviewed >= 7) results[skill].good.unshift(`Your AI coach scored ${what} ${shown} out of 10.`);
      else if (reviewed <= 4.5) results[skill].work.unshift(`Your AI coach scored ${what} ${shown} out of 10 — the clearest place to start.`);
    }
  }

  for (const s of SKILLS) {
    const sc = results[s].score;
    results[s].score = sc == null ? null : Math.round(sc * 10) / 10;
    results[s].rating = ratingFromScore(results[s].score);
  }

  const measuredSkills = SKILLS.filter((s) => results[s].score != null);
  const byScore = [...measuredSkills].sort((a, b) => results[b].score! - results[a].score!);
  const strengths: { skill: SkillId; text: string }[] = [];
  for (const s of byScore) {
    const text = results[s].good[0];
    if (text && strengths.length < 2) strengths.push({ skill: s, text });
  }
  // Something kind to say even when nothing stood out.
  if (!strengths.length && input.talkSeconds && input.talkSeconds >= 45) {
    strengths.push({ skill: "impromptu", text: `You kept going for ${Math.round(input.talkSeconds)} seconds on a topic you'd never seen — that's the hard part.` });
  }
  const focus: { skill: SkillId; text: string }[] = [];
  for (const s of [...byScore].reverse()) {
    const text = results[s].work[0];
    if (text && focus.length < 2 && !strengths.some((x) => x.skill === s)) focus.push({ skill: s, text });
  }

  const overall = mean(measuredSkills.map((s) => results[s].score));
  return {
    skills: results,
    strengths,
    focus,
    observed: overall == null ? null : Math.max(1, Math.min(5, Math.round(overall / 2))),
  };
}

// "You came across better than you thought" — when the self-rating was
// clearly below what was measured.
export function feltBelowObserved(felt: number | null, observed: number | null): boolean {
  return felt != null && observed != null && observed - felt >= 1;
}
