import type { DifficultyTier, DspStatus, Prompt, SessionType } from "./sessionTypes";
import type { WarmUpIntensity } from "./warmUpRoutine";
import { PREP_DURATION_STEP_SECONDS, randomStepValue, type DurationMode } from "./recordingSettings";

// Adaptive Curriculum Engine (Phase 5) — reads recent performance and
// automatically adjusts difficulty (prompt pool, drill tier, recording
// length, warm-up length) as one unified 1-5 level.
//
// **Gradual by design, on purpose** — this app is meant to be used for
// months, and the level is meant to track slowly-earned skill, not react to
// a good or bad day. Every constant below (the dead zone between
// LEVEL_UP/LEVEL_DOWN thresholds, the minimum session count before the very
// first move, and especially COOLDOWN_SESSIONS) is chosen to make sudden or
// frequent jumps structurally impossible: at most one level per evaluation,
// a multi-session cooldown between any two moves, and a wide dead zone so
// one noisy session can't flip the verdict. See COOLDOWN_SESSIONS' comment
// for the specific reasoning.
export type CurriculumLevel = 1 | 2 | 3 | 4 | 5;

// Everyone starts at the bottom, not the middle — Level 1 is the most
// forgiving rung (shortest recording, longest/most predictable prep — see
// LEVEL_DURATION_SECONDS and LEVEL_PREP_RANGE below), and COOLDOWN_SESSIONS
// below is what actually paces the months-long climb from here, not this
// starting point.
export const DEFAULT_CURRICULUM_LEVEL: CurriculumLevel = 1;

// Composite (0-10) thresholds that move the level — the 2.5-point gap
// between them is a deliberate dead zone (hysteresis) so a composite
// hovering around "pretty good" doesn't flap the level back and forth
// evaluation to evaluation.
export const LEVEL_UP_THRESHOLD = 7.5;
export const LEVEL_DOWN_THRESHOLD = 5.0;

// No level move at all — even off the default — until this many eligible
// spontaneous sessions exist. Gives the composite something real to average
// over before it's trusted to say anything.
export const MIN_SESSIONS_BEFORE_MOVE = 5;

// How many *new* eligible spontaneous sessions must land after the last
// level change before another one is even considered — counted from
// curriculum_state's last row, not wall-clock time, so it works the same
// whether someone practices daily or in bursts. Set to 6 (well above the
// plan's original minimum of 3) specifically so the level can't visibly
// jump around inside a single week of daily practice — going from Level 1
// to Level 5 (4 ups) takes a minimum of ~30 sessions even at a perfect
// streak, which reads as "months of consistent practice," not "a good
// week." Revisit this number with real usage data before loosening it.
export const COOLDOWN_SESSIONS = 6;

// Rolling window sizes for the two composites.
export const SPONTANEOUS_WINDOW_N = 8;
export const DRILL_WINDOW_M = 6;
export const MIN_DRILL_COMPLETIONS = 5;

// Composite blend weights.
const SPONTANEOUS_WEIGHT = 0.7;
const DRILL_WEIGHT = 0.3;

// Per-session blend weights (spontaneousComposite).
const OVERALL_WEIGHT = 0.4;
const DELIVERY_WEIGHT = 0.3;
const COHERENCE_WEIGHT = 0.15;
const RICH_DELIVERY_WEIGHT = 0.15;

export const MIN_TIER_POOL_SIZE = 15;

export type CurriculumDirection = "up" | "down" | "none" | "initial";
export type CurriculumComponent = "overall" | "delivery" | "coherence" | "drill";
export type CurriculumReason = "changed" | "insufficient_data" | "cooldown" | "stable";

// One spontaneous (non-script_practice) session's signal, already flattened
// from whatever combination of `sessions`/`scores` columns it came from —
// keeps this file free of any DB/query shape knowledge (mirrors trends.ts's
// "no DB access in this file" convention).
export interface CurriculumSessionSignal {
  sessionType: SessionType;
  overallScore: number;
  // Same rate/volume/pitchMelody/tonality/pausing mean statsRepo.ts already
  // computes for trends.ts's ScoredSessionSummary — callers should reuse
  // that exact computation rather than re-deriving it differently here.
  deliveryAvgScore: number;
  contentCoherenceScore: number;
  // '' alongside a 0 score means "predates migration v5" (never actually
  // scored), not "scored zero" — see the legacy-data guard below.
  contentCoherenceNotes: string;
  // Optional Phase-2 on-device audio signal — null when dsp_status isn't
  // 'complete' (analysis never ran or failed) or the session predates it.
  richDeliveryScore: number | null;
}

export interface CurriculumDrillSignal {
  accuracyPercent: number; // 0-100
}

function average(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Legacy-data guard: contentCoherenceScore === 0 with empty notes means
// "predates migration v5," not "scored zero" — treated as missing so it
// renormalizes away instead of silently dragging the composite down.
function eligibleCoherence(session: CurriculumSessionSignal): number | null {
  if (session.contentCoherenceScore === 0 && session.contentCoherenceNotes === "") return null;
  return session.contentCoherenceScore;
}

// Weighted blend of one session's sub-scores, renormalized to whichever
// components are actually present (never treats a missing optional
// component as a zero — that would silently tank the composite until
// Phase 2 audio data or migration v5 scoring exists for every session).
function blendSessionScore(session: CurriculumSessionSignal): number {
  const coherence = eligibleCoherence(session);
  const components: Array<{ value: number | null; weight: number }> = [
    { value: session.overallScore, weight: OVERALL_WEIGHT },
    { value: session.deliveryAvgScore, weight: DELIVERY_WEIGHT },
    { value: coherence, weight: COHERENCE_WEIGHT },
    { value: session.richDeliveryScore, weight: RICH_DELIVERY_WEIGHT },
  ];
  const present = components.filter((c): c is { value: number; weight: number } => c.value !== null);
  const totalWeight = present.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight === 0) return session.overallScore; // defensive — overallScore is never actually missing
  return present.reduce((sum, c) => sum + c.value * c.weight, 0) / totalWeight;
}

// Rolling mean over the last N=8 eligible (non-script_practice) sessions —
// `sessions` should be ordered oldest-first, same convention as
// statsRepo.ts's getScoredSessionSummaries(). Filters script_practice
// defensively even though callers are expected to have already excluded it
// at the query level.
export function computeSpontaneousComposite(sessions: CurriculumSessionSignal[]): number | null {
  const eligible = sessions.filter((s) => s.sessionType !== "script_practice");
  if (eligible.length === 0) return null;
  const window = eligible.slice(-SPONTANEOUS_WINDOW_N);
  const mean = average(window.map(blendSessionScore));
  return mean === null ? null : round1(mean);
}

// Mean accuracy (0-10 scale) over the last M=6 drill completions —
// `recentFirstDrills` most-recent-first (matches drillsRepo.getRecentDrillCompletions's
// natural DESC order). null (not 0) below MIN_DRILL_COMPLETIONS total —
// dropped from the blend entirely rather than treated as a bad score.
export function computeDrillComposite(recentFirstDrills: CurriculumDrillSignal[]): number | null {
  if (recentFirstDrills.length < MIN_DRILL_COMPLETIONS) return null;
  const window = recentFirstDrills.slice(0, DRILL_WINDOW_M);
  const mean = average(window.map((d) => d.accuracyPercent / 10));
  return mean === null ? null : round1(mean);
}

// 0.70/0.30 blend, renormalized to 1.0 on spontaneousComposite alone when
// drillComposite isn't eligible yet (never zeroed).
export function computeOverallComposite(spontaneousComposite: number | null, drillComposite: number | null): number | null {
  if (spontaneousComposite === null) return null;
  if (drillComposite === null) return spontaneousComposite;
  return round1(spontaneousComposite * SPONTANEOUS_WEIGHT + drillComposite * DRILL_WEIGHT);
}

interface DominantComponentResult {
  component: CurriculumComponent;
  score: number;
}

// Which sub-signal most drove the move — the weakest of the eligible ones
// for a downgrade, the strongest for an upgrade. Purely for the explanation
// string; never affects the level decision itself.
function dominantComponent(
  sessions: CurriculumSessionSignal[],
  drillComposite: number | null,
  direction: "up" | "down",
): DominantComponentResult {
  const window = sessions.filter((s) => s.sessionType !== "script_practice").slice(-SPONTANEOUS_WINDOW_N);
  const overallAvg = average(window.map((s) => s.overallScore));
  const deliveryAvg = average(window.map((s) => s.deliveryAvgScore));
  const coherenceAvg = average(window.map(eligibleCoherence).filter((v): v is number => v !== null));

  const candidates: DominantComponentResult[] = [];
  if (overallAvg !== null) candidates.push({ component: "overall", score: round1(overallAvg) });
  if (deliveryAvg !== null) candidates.push({ component: "delivery", score: round1(deliveryAvg) });
  if (coherenceAvg !== null) candidates.push({ component: "coherence", score: round1(coherenceAvg) });
  if (drillComposite !== null) candidates.push({ component: "drill", score: drillComposite });

  if (candidates.length === 0) return { component: "overall", score: 0 };
  return direction === "down"
    ? candidates.reduce((min, c) => (c.score < min.score ? c : min))
    : candidates.reduce((max, c) => (c.score > max.score ? c : max));
}

export interface CurriculumEvaluationInput {
  currentLevel: CurriculumLevel;
  // ALL eligible (non-script_practice, status='done') spontaneous sessions,
  // oldest-first — used both for the rolling composite (internally
  // windowed) and the total count that gates eligibility/cooldown.
  spontaneousSessions: CurriculumSessionSignal[];
  // Most-recent-first, matching getRecentDrillCompletions()'s natural order.
  recentDrillsFirst: CurriculumDrillSignal[];
  // The spontaneous session count recorded on the last curriculum_state
  // row — the cooldown checkpoint new sessions are counted from.
  spontaneousSessionCountAtLastChange: number;
}

export interface CurriculumDecision {
  level: CurriculumLevel;
  direction: CurriculumDirection;
  component: CurriculumComponent | null;
  componentScore: number | null;
  reason: CurriculumReason;
  spontaneousComposite: number | null;
  drillComposite: number | null;
  spontaneousSessionCount: number;
}

// Pure decision function — no I/O, no Date.now(). At most one level moves
// per call, gated by MIN_SESSIONS_BEFORE_MOVE and COOLDOWN_SESSIONS above.
export function evaluateCurriculum(input: CurriculumEvaluationInput): CurriculumDecision {
  const totalSpontaneous = input.spontaneousSessions.filter((s) => s.sessionType !== "script_practice").length;
  const spontaneousComposite = computeSpontaneousComposite(input.spontaneousSessions);
  const drillComposite = computeDrillComposite(input.recentDrillsFirst);

  const base = { spontaneousComposite, drillComposite, spontaneousSessionCount: totalSpontaneous };

  if (totalSpontaneous < MIN_SESSIONS_BEFORE_MOVE) {
    return { level: input.currentLevel, direction: "none", component: null, componentScore: null, reason: "insufficient_data", ...base };
  }

  const sessionsSinceLastChange = totalSpontaneous - input.spontaneousSessionCountAtLastChange;
  if (sessionsSinceLastChange < COOLDOWN_SESSIONS) {
    return { level: input.currentLevel, direction: "none", component: null, componentScore: null, reason: "cooldown", ...base };
  }

  const composite = computeOverallComposite(spontaneousComposite, drillComposite);
  if (composite === null) {
    return { level: input.currentLevel, direction: "none", component: null, componentScore: null, reason: "insufficient_data", ...base };
  }

  if (composite >= LEVEL_UP_THRESHOLD && input.currentLevel < 5) {
    const dominant = dominantComponent(input.spontaneousSessions, drillComposite, "up");
    return {
      level: (input.currentLevel + 1) as CurriculumLevel,
      direction: "up",
      component: dominant.component,
      componentScore: dominant.score,
      reason: "changed",
      ...base,
    };
  }

  if (composite <= LEVEL_DOWN_THRESHOLD && input.currentLevel > 1) {
    const dominant = dominantComponent(input.spontaneousSessions, drillComposite, "down");
    return {
      level: (input.currentLevel - 1) as CurriculumLevel,
      direction: "down",
      component: dominant.component,
      componentScore: dominant.score,
      reason: "changed",
      ...base,
    };
  }

  return { level: input.currentLevel, direction: "none", component: null, componentScore: null, reason: "stable", ...base };
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
    return `You've set Level ${ctx.level} for Practice — it stays there until you switch back to Auto. Lessons and your daily plan still follow your reps.`;
  }
  if (ctx.direction === "initial") {
    return `Starting at Level ${ctx.level}. From here it follows your impromptu reps.`;
  }
  if (ctx.reason === "changed" && ctx.direction === "up") {
    return `Your recent reps went well — moving up to Level ${ctx.level}.`;
  }
  if (ctx.reason === "changed" && ctx.direction === "down") {
    return `Your last rep was a stretch — easing back to Level ${ctx.level}.`;
  }
  return `Level ${ctx.level}. It follows your impromptu reps: each one that goes well nudges it up a little, and one that's a stretch eases it back.`;
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

export interface RichDeliveryInput {
  dspStatus: DspStatus | null;
  pitchAvgHz: number | null;
  pitchMinHz: number | null;
  pitchMaxHz: number | null;
  volumeStddevDbfs: number | null;
}

// First-pass heuristic, not empirically calibrated — flagged clearly per
// this repo's convention for judgment calls (see warmUpRoutine.ts's
// scaling-direction note). Rewards pitch variation relative to the
// speaker's own register (a monotone voice reads near 0, an animated one
// near 10) and healthy volume variation (some dynamic range, not a flat
// drone) as proxies for "expressive" delivery — not claimed to be
// objectively "correct" delivery. Only 15% of the per-session blend and
// drops out via renormalization whenever it's null, so miscalibration here
// has a deliberately limited blast radius. Revisit once there's enough real
// session data to calibrate against actual outcomes.
export function computeRichDeliveryScore(input: RichDeliveryInput): number | null {
  if (
    input.dspStatus !== "complete" ||
    input.pitchAvgHz === null ||
    input.pitchAvgHz <= 0 ||
    input.pitchMinHz === null ||
    input.pitchMaxHz === null ||
    input.volumeStddevDbfs === null
  ) {
    return null;
  }

  const pitchRangeRatio = (input.pitchMaxHz - input.pitchMinHz) / input.pitchAvgHz;
  const pitchScore = Math.min(10, (pitchRangeRatio / 0.6) * 10);

  // dBFS stddev of ~6 reads as natural emphasis variation; much less is
  // flat/monotone. (Much more likely means erratic mic distance rather than
  // genuine expressiveness, but this simple heuristic doesn't penalize that
  // yet — see the file-level note on recalibration.)
  const volumeScore = Math.min(10, (input.volumeStddevDbfs / 6) * 10);

  return round1((pitchScore + volumeScore) / 2);
}
