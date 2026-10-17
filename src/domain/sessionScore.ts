import type { CoachOutput } from "./coach/ruleCoach";
import type { PauseAnalysis } from "./dsp/pauses";
import type { PresenceMetrics } from "./presenceMetrics";
import type { SessionScores } from "./sessionTypes";

// One 0-10 score per session from everything measured: the on-device
// analysis (always) and the cloud review (when requested). Each category
// blends the two by how much each source can be trusted there — the phone
// measures pace and gaze directly, the cloud model judges content and tone
// better — and categories with no data drop out, with the rest renormalized.
//
// A reviewer that watches the video (Gemini) leads wherever it can see:
// it hears the voice and sees the face itself, where the phone's numbers
// are proxies (its gaze thresholds aren't tuned). A reviewer that only reads
// the phone's transcript and measurements gets less say, since its delivery
// and presence judgments are built from those same numbers.
//
// Every phone-measured category also carries its factors: the measurement,
// the sub-score it earned, and the rule behind it — what took points away
// and what would earn them back.

export interface LocalMeasurements {
  durationSeconds: number;
  wpmAvg: number | null;
  fillerRatePerMinute: number | null;
  // The filler rate was counted in the AI coach's own transcript (it hears
  // the audio, so it catches ums the phone's recognizer drops).
  fillersFromAi?: boolean;
  pitchRangeHz: number | null;
  pauses: PauseAnalysis | null;
  presence: PresenceMetrics | null;
  coach: Pick<CoachOutput, "structure" | "hedges" | "strongEnding"> | null;
  targetFramework?: string | null;
}

export type ScoreCategory = "delivery" | "fluency" | "content" | "presence" | "congruence";

// What the cloud reviewer had to go on: the video itself (Gemini), or the
// phone's transcript and measurements (the text-only providers).
export type CloudSource = "video" | "measurements";

// One measured ingredient of a category, explained: either a sub-score
// (averaged into the category) or an adjustment (added to it).
export interface ScoreFactor {
  label: string;
  // The measurement, as shown ("172 wpm", "40% of full stops").
  value: string;
  score?: number; // 0-10
  delta?: number; // points added or taken away
  // How it's scored, and what would raise it.
  rule: string;
}

export interface ScoreComponent {
  key: ScoreCategory;
  label: string;
  local: number | null;
  cloud: number | null;
  score: number;
  weight: number; // share of the overall, after renormalizing
  // Share of this category taken from the cloud when both sources exist.
  cloudShare?: number;
  // The phone's ingredients for `local` (absent on older breakdowns).
  factors?: ScoreFactor[];
}

export interface SessionScoreBreakdown {
  overall: number;
  components: ScoreComponent[];
  // The cloud model's own holistic score, folded in at `cloudOverallShare`.
  cloudOverall: number | null;
  sources: ("device" | "cloud")[];
  cloudSource?: CloudSource;
  cloudOverallShare?: number;
  // 2: carries factors and shares. Older stored breakdowns are recomputed.
  version?: number;
}

export const SCORE_BREAKDOWN_VERSION = 2;

const CATEGORY_WEIGHTS: Record<ScoreCategory, number> = {
  delivery: 0.25,
  fluency: 0.15,
  content: 0.3,
  presence: 0.2,
  congruence: 0.1,
};

// How much of a category comes from the cloud when both sources exist.
const CLOUD_TRUST: Record<CloudSource, Record<ScoreCategory, number>> = {
  video: {
    delivery: 0.7,
    fluency: 0,
    content: 0.85,
    presence: 0.75,
    congruence: 1,
  },
  measurements: {
    delivery: 0.5,
    fluency: 0,
    content: 0.75,
    presence: 0.4,
    congruence: 1,
  },
};

const CLOUD_OVERALL_SHARE: Record<CloudSource, number> = { video: 0.25, measurements: 0.15 };

const LABELS: Record<ScoreCategory, string> = {
  delivery: "Voice & pace",
  fluency: "Fluency",
  content: "Structure & content",
  presence: "Presence",
  congruence: "Face-voice match",
};

const clamp10 = (n: number) => Math.max(0, Math.min(10, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

function mean(values: (number | null | undefined)[]): number | null {
  const present = values.filter((v): v is number => v != null && Number.isFinite(v));
  return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
}

function weighted(parts: { value: number | null; weight: number }[]): number | null {
  const present = parts.filter((p): p is { value: number; weight: number } => p.value != null);
  const total = present.reduce((sum, p) => sum + p.weight, 0);
  return total > 0 ? present.reduce((sum, p) => sum + p.value * p.weight, 0) / total : null;
}

// --- On-device sub-scores (0-10). Bands match ruleCoach's verdicts. ---

export function paceScore(wpm: number): number {
  const distance = wpm < 130 ? 130 - wpm : wpm > 160 ? wpm - 160 : 0;
  return clamp10(10 - distance / 7);
}

function pauseScore(boundaryPauseRate: number): number {
  return clamp10((boundaryPauseRate / 0.6) * 10);
}

function pitchScore(rangeHz: number): number {
  return clamp10((rangeHz / 110) * 10);
}

export function fillerScore(perMinute: number): number {
  return clamp10(10 - Math.max(0, perMinute - 2) * 0.8);
}

function hesitationScore(hesitations: number, durationSeconds: number): number {
  const perMinute = hesitations / Math.max(durationSeconds / 60, 0.5);
  return clamp10(10 - perMinute * 2);
}

interface Scored {
  score: number | null;
  factors: ScoreFactor[];
}

function deliveryScored(m: LocalMeasurements): Scored {
  const factors: ScoreFactor[] = [];
  if (m.wpmAvg != null) {
    const wpm = Math.round(m.wpmAvg);
    factors.push({
      label: "Pace",
      value: `${wpm} words a minute`,
      score: round1(paceScore(wpm)),
      rule:
        wpm < 130
          ? `Full marks between 130 and 160 words a minute. You were ${130 - wpm} under, and every 7 under costs a point. Pick up the pace a little, or trim long gaps.`
          : wpm > 160
            ? `Full marks between 130 and 160 words a minute. You were ${wpm - 160} over, and every 7 over costs a point. A pause at each full stop slows you down without dragging.`
            : "Between 130 and 160 words a minute, where listeners follow easily: full marks.",
    });
  }
  if (m.pauses?.boundaryPauseRate != null) {
    const rate = m.pauses.boundaryPauseRate;
    factors.push({
      label: "Pauses at full stops",
      value: `${Math.round(rate * 100)}% of sentence ends`,
      score: round1(pauseScore(rate)),
      rule:
        rate >= 0.6
          ? "You paused at most sentence ends: full marks from 60% up."
          : "Full marks once 60% of your sentence ends get a pause. A beat at each full stop lets the point land.",
    });
  }
  if (m.pitchRangeHz != null) {
    const hz = Math.round(m.pitchRangeHz);
    factors.push({
      label: "Pitch range",
      value: `${hz} Hz`,
      score: round1(pitchScore(hz)),
      rule:
        hz >= 110
          ? "Your voice moved through a wide range: full marks from 110 Hz up."
          : "Full marks at a 110 Hz range. A narrow range sounds flat; let your voice rise and fall, and lift the key word in each sentence.",
    });
  }
  return { score: mean(factors.map((f) => f.score)), factors };
}

function fluencyScored(m: LocalMeasurements): Scored {
  const factors: ScoreFactor[] = [];
  if (m.fillerRatePerMinute != null) {
    const rate = m.fillerRatePerMinute;
    factors.push({
      label: "Filler words",
      value: `${Math.round(rate * 10) / 10} a minute${m.fillersFromAi ? " (counted by your AI coach)" : ""}`,
      score: round1(fillerScore(rate)),
      rule:
        rate <= 2
          ? "Up to 2 a minute go unnoticed: full marks."
          : "The first 2 a minute are free, and each one after costs 0.8. Swap \"um\" for a closed-mouth pause.",
    });
  }
  if (m.pauses) {
    const perMinute = m.pauses.hesitations / Math.max(m.durationSeconds / 60, 0.5);
    factors.push({
      label: "Stalls",
      value: `${m.pauses.hesitations} (${Math.round(perMinute * 10) / 10} a minute)`,
      score: round1(hesitationScore(m.pauses.hesitations, m.durationSeconds)),
      rule: "A stall is a long gap in the middle of a phrase, and each one a minute costs 2 points. Pausing between sentences is fine; only the mid-phrase gaps count.",
    });
  }
  return { score: mean(factors.map((f) => f.score)), factors };
}

// What the content score is built from on the phone: whether the answer had
// a shape, whether it ended cleanly, and how much it hedged.
function structureScored(m: LocalMeasurements): Scored {
  if (!m.coach) return { score: null, factors: [] };
  const { structure, hedges, strongEnding } = m.coach;
  const factors: ScoreFactor[] = [];
  const shaped = structure.framework !== "None";
  let score = shaped ? 8 : 4;
  factors.push({
    label: "Shape",
    value: shaped ? structure.framework : "None found",
    score,
    rule: shaped
      ? `Your answer followed a clear shape (${structure.framework}), which starts this at 8.`
      : "No clear shape was found, which starts this at 4. Lead with your point, back it with a reason or an example, then say the point again.",
  });
  if (m.targetFramework && m.targetFramework !== "None" && structure.framework !== m.targetFramework) {
    const capped = Math.min(score, 5);
    if (capped < score) {
      factors.push({
        label: "Practice target",
        value: `Asked for ${m.targetFramework}`,
        delta: capped - score,
        rule: `This rep practices ${m.targetFramework}, and a different shape caps this at 5.`,
      });
    }
    score = capped;
  }
  if (strongEnding === true) {
    score += 1;
    factors.push({ label: "Ending", value: "Clear", delta: 1, rule: "You ended on a clear statement instead of trailing off: +1." });
  } else if (strongEnding === false) {
    score -= 1;
    factors.push({ label: "Ending", value: "Trailed off", delta: -1, rule: "The answer trailed off: -1. Finish on your point, then stop talking." });
  }
  const hedgeCost = Math.min(2, Math.max(0, hedges.length - 2) * 0.5);
  score -= hedgeCost;
  if (hedges.length > 0) {
    factors.push({
      label: "Hedges",
      value: `${hedges.length}`,
      delta: hedgeCost ? -hedgeCost : undefined,
      rule:
        hedgeCost > 0
          ? "\"I think\", \"kind of\", \"maybe\": the first two are free, and each one after costs 0.5 (up to 2). Say it as if you mean it."
          : "\"I think\", \"kind of\", \"maybe\": the first two are free.",
    });
  }
  return { score: clamp10(score), factors };
}

function presenceScored(p: PresenceMetrics | null): Scored {
  if (!p || p.presentPercent < 40) return { score: null, factors: [] };
  const gaze = p.eyeContactSource === "gaze";
  const eyeTarget = gaze ? 75 : 90;
  const eye = clamp10((p.eyeContactPercent / eyeTarget) * 10);
  const face = clamp10(p.expressiveness / 3);
  const level = p.tiltedPercent != null ? clamp10(10 - p.tiltedPercent / 10) : null;
  const factors: ScoreFactor[] = [
    {
      label: "Eye contact",
      value: `${Math.round(p.eyeContactPercent)}% on the lens`,
      score: round1(eye),
      rule: `Full marks at ${eyeTarget}% of the time looking at the lens${gaze ? "" : " (this phone could only track where your head pointed, so the bar is higher)"}. Counts for 60% of presence.`,
    },
    {
      label: "Expression",
      value: `${Math.round(p.expressiveness)} of 100`,
      score: round1(face),
      rule: "Full marks once your face moves with what you're saying (30 on this scale). A still face reads as flat, even with a lively voice. Counts for 30%.",
    },
  ];
  if (level != null) {
    factors.push({
      label: "Head level",
      value: `Tilted ${Math.round(p.tiltedPercent!)}% of the time`,
      score: round1(level),
      rule: "Each 10% of the time your head is tilted costs a point. Counts for 10%.",
    });
  }
  return {
    score: weighted([
      { value: eye, weight: 0.6 },
      { value: face, weight: 0.3 },
      { value: level, weight: 0.1 },
    ]),
    factors,
  };
}

function localScored(m: LocalMeasurements): Record<ScoreCategory, Scored> {
  return {
    delivery: deliveryScored(m),
    fluency: fluencyScored(m),
    content: structureScored(m),
    presence: presenceScored(m.presence),
    congruence: { score: null, factors: [] },
  };
}

function cloudScores(s: SessionScores): Record<ScoreCategory, number | null> {
  return {
    delivery: mean([s.rateScore, s.volumeScore, s.pitchMelodyScore, s.tonalityScore, s.pausingScore]),
    fluency: null,
    content: mean([s.structureScore, s.relevanceScore, s.coherenceScore]),
    presence: mean([s.eyeContactScore, s.facialExpressivenessScore]),
    congruence: s.faceVoiceCongruenceScore,
  };
}

// The cloud reviewer's own sub-scores for a category, each with its notes
// (which say what capped the score and what a 10 would look like).
export function cloudFactors(s: SessionScores, key: ScoreCategory): { label: string; score: number; notes: string | null }[] {
  switch (key) {
    case "delivery":
      return [
        { label: `Rate (${Math.round(s.rateWpmAvg)} wpm)`, score: s.rateScore, notes: s.rateNotes || null },
        { label: "Volume", score: s.volumeScore, notes: s.volumeNotes || null },
        { label: "Pitch and melody", score: s.pitchMelodyScore, notes: s.pitchMelodyNotes || null },
        { label: "Tonality", score: s.tonalityScore, notes: s.tonalityNotes || null },
        { label: "Pausing", score: s.pausingScore, notes: s.pausingNotes || null },
      ];
    case "content":
      return [
        { label: s.structureUsed === "none detected" ? "Structure (none found)" : `Structure (${s.structureUsed})`, score: s.structureScore, notes: s.structureNotes || null },
        { label: "Relevance to the prompt", score: s.relevanceScore, notes: s.relevanceNotes || null },
        { label: "Coherence", score: s.coherenceScore, notes: s.coherenceNotes || null },
      ];
    case "presence":
      return [
        { label: "Eye contact", score: s.eyeContactScore, notes: null },
        { label: "Facial expression", score: s.facialExpressivenessScore, notes: s.bodyLanguageNotes || null },
      ];
    case "congruence":
      return [{ label: "Face matches voice", score: s.faceVoiceCongruenceScore, notes: null }];
    case "fluency":
      return [];
  }
}

export function computeSessionScore(
  local: LocalMeasurements,
  cloud: SessionScores | null,
  cloudSource: CloudSource = "measurements",
): SessionScoreBreakdown | null {
  const l = localScored(local);
  const c = cloud ? cloudScores(cloud) : null;
  const trust = CLOUD_TRUST[cloudSource];
  const keys = Object.keys(CATEGORY_WEIGHTS) as ScoreCategory[];

  const raw = keys
    .map((key): ScoreComponent | null => {
      const localValue = l[key].score;
      const cloudValue = c?.[key] ?? null;
      const score = weighted([
        { value: localValue, weight: 1 - trust[key] },
        { value: cloudValue, weight: trust[key] },
      ]) ?? (localValue ?? cloudValue);
      if (score == null) return null;
      return {
        key,
        label: LABELS[key],
        local: localValue,
        cloud: cloudValue,
        score,
        weight: CATEGORY_WEIGHTS[key],
        cloudShare: localValue != null && cloudValue != null ? trust[key] : cloudValue != null ? 1 : 0,
        factors: l[key].factors,
      };
    })
    .filter((x): x is ScoreComponent => x !== null);
  if (!raw.length) return null;

  const totalWeight = raw.reduce((sum, r) => sum + r.weight, 0);
  const components = raw.map((r) => ({
    ...r,
    local: r.local == null ? null : round1(r.local),
    cloud: r.cloud == null ? null : round1(r.cloud),
    score: round1(r.score),
    weight: r.weight / totalWeight,
  }));
  const blended = raw.reduce((sum, r) => sum + r.score * (r.weight / totalWeight), 0);
  const cloudOverall = cloud ? cloud.overallScore : null;
  const share = CLOUD_OVERALL_SHARE[cloudSource];
  const overall = cloudOverall != null ? blended * (1 - share) + cloudOverall * share : blended;

  const sources: ("device" | "cloud")[] = [];
  if (keys.some((k) => l[k].score != null)) sources.push("device");
  if (cloud) sources.push("cloud");
  return {
    overall: round1(clamp10(overall)),
    components,
    cloudOverall,
    sources,
    cloudSource: cloud ? cloudSource : undefined,
    cloudOverallShare: cloud ? share : undefined,
    version: SCORE_BREAKDOWN_VERSION,
  };
}
