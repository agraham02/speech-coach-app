import type { CoachOutput } from "./coach/ruleCoach";
import type { PauseAnalysis } from "./dsp/pauses";
import type { PresenceMetrics } from "./presenceMetrics";
import type { SessionScores } from "./sessionTypes";

// One 0-10 score per session from everything measured: the on-device
// analysis (always) and the cloud review (when requested). Each category
// blends the two by how much each source can be trusted there — the phone
// measures pace and gaze directly, the cloud model judges content and tone
// better — and categories with no data drop out, with the rest renormalized.

export interface LocalMeasurements {
  durationSeconds: number;
  wpmAvg: number | null;
  fillerRatePerMinute: number | null;
  pitchRangeHz: number | null;
  pauses: PauseAnalysis | null;
  presence: PresenceMetrics | null;
  coach: Pick<CoachOutput, "structure" | "hedges" | "strongEnding"> | null;
  targetFramework?: string | null;
}

export type ScoreCategory = "delivery" | "fluency" | "content" | "presence" | "congruence";

export interface ScoreComponent {
  key: ScoreCategory;
  label: string;
  local: number | null;
  cloud: number | null;
  score: number;
  weight: number; // share of the overall, after renormalizing
}

export interface SessionScoreBreakdown {
  overall: number;
  components: ScoreComponent[];
  // The cloud model's own holistic score, folded in at CLOUD_OVERALL_SHARE.
  cloudOverall: number | null;
  sources: ("device" | "cloud")[];
}

const CATEGORY_WEIGHTS: Record<ScoreCategory, number> = {
  delivery: 0.25,
  fluency: 0.15,
  content: 0.3,
  presence: 0.2,
  congruence: 0.1,
};

// How much of a category comes from the cloud when both sources exist.
const CLOUD_TRUST: Record<ScoreCategory, number> = {
  delivery: 0.5,
  fluency: 0,
  content: 0.75,
  presence: 0.4,
  congruence: 1,
};

const CLOUD_OVERALL_SHARE = 0.15;

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

function structureScore(m: LocalMeasurements): number | null {
  if (!m.coach) return null;
  const { structure, hedges, strongEnding } = m.coach;
  let score = structure.framework !== "None" ? 8 : 4;
  if (m.targetFramework && m.targetFramework !== "None" && structure.framework !== m.targetFramework) score = Math.min(score, 5);
  if (strongEnding === true) score += 1;
  if (strongEnding === false) score -= 1;
  score -= Math.min(2, Math.max(0, hedges.length - 2) * 0.5);
  return clamp10(score);
}

function presenceScore(p: PresenceMetrics | null): number | null {
  if (!p || p.presentPercent < 40) return null;
  const eyeTarget = p.eyeContactSource === "gaze" ? 75 : 90;
  return weighted([
    { value: clamp10((p.eyeContactPercent / eyeTarget) * 10), weight: 0.6 },
    { value: clamp10(p.expressiveness / 3), weight: 0.3 },
    { value: p.tiltedPercent != null ? clamp10(10 - p.tiltedPercent / 10) : null, weight: 0.1 },
  ]);
}

function localScores(m: LocalMeasurements): Record<ScoreCategory, number | null> {
  return {
    delivery: mean([
      m.wpmAvg != null ? paceScore(m.wpmAvg) : null,
      m.pauses?.boundaryPauseRate != null ? pauseScore(m.pauses.boundaryPauseRate) : null,
      m.pitchRangeHz != null ? pitchScore(m.pitchRangeHz) : null,
    ]),
    fluency: mean([
      m.fillerRatePerMinute != null ? fillerScore(m.fillerRatePerMinute) : null,
      m.pauses ? hesitationScore(m.pauses.hesitations, m.durationSeconds) : null,
    ]),
    content: structureScore(m),
    presence: presenceScore(m.presence),
    congruence: null,
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

export function computeSessionScore(local: LocalMeasurements, cloud: SessionScores | null): SessionScoreBreakdown | null {
  const l = localScores(local);
  const c = cloud ? cloudScores(cloud) : null;
  const keys = Object.keys(CATEGORY_WEIGHTS) as ScoreCategory[];

  const raw = keys
    .map((key) => {
      const localValue = l[key];
      const cloudValue = c?.[key] ?? null;
      const score = weighted([
        { value: localValue, weight: 1 - CLOUD_TRUST[key] },
        { value: cloudValue, weight: CLOUD_TRUST[key] },
      ]) ?? (localValue ?? cloudValue);
      return score == null ? null : { key, label: LABELS[key], local: localValue, cloud: cloudValue, score, weight: CATEGORY_WEIGHTS[key] };
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
  const overall = cloudOverall != null ? blended * (1 - CLOUD_OVERALL_SHARE) + cloudOverall * CLOUD_OVERALL_SHARE : blended;

  const sources: ("device" | "cloud")[] = [];
  if (keys.some((k) => l[k] != null)) sources.push("device");
  if (cloud) sources.push("cloud");
  return { overall: round1(clamp10(overall)), components, cloudOverall, sources };
}
