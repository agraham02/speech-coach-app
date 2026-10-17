import type { CoachOutput, Verdict } from "./coach/ruleCoach";
import type { CloudSource } from "./sessionScore";
import type { SessionScores } from "./sessionTypes";
import type { SkillId } from "../theme/tokens";

// How one impromptu take moves skill mastery: a 0-1 result per skill it
// showed evidence for. The phone's coach gives a verdict per observation;
// a deep review gives 0-10 scores. When both exist, the review leads — by
// more when it watched the video — because judging whether an answer had a
// shape, or a voice had life, is exactly what the phone's rules do worst.
// Articulation stays phone-only: no reviewer scores clarity directly. Pure.

export type SkillEvidence = Partial<Record<SkillId, number>>;

const VERDICT_SCORE: Record<Verdict, number> = { good: 0.9, ok: 0.6, work: 0.3 };

// Share of a skill's result taken from the deep review when both exist.
export const REVIEW_SHARE: Record<CloudSource, number> = { video: 0.7, measurements: 0.5 };

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export function localRepEvidence(coach: CoachOutput): SkillEvidence {
  const bySkill = new Map<SkillId, number[]>();
  for (const o of coach.observations) bySkill.set(o.skill, [...(bySkill.get(o.skill) ?? []), VERDICT_SCORE[o.verdict]]);
  const out: SkillEvidence = {};
  for (const [skill, scores] of bySkill) out[skill] = mean(scores)!;
  return out;
}

export function cloudRepEvidence(s: SessionScores): SkillEvidence {
  const tenth = (xs: number[]) => {
    const m = mean(xs.filter((x) => Number.isFinite(x)));
    return m == null ? undefined : Math.max(0, Math.min(1, m / 10));
  };
  const out: SkillEvidence = {
    cadence: tenth([s.rateScore, s.pitchMelodyScore, s.pausingScore, s.tonalityScore]),
    impromptu: tenth([s.structureScore, s.relevanceScore, s.coherenceScore]),
    confidence: tenth([s.eyeContactScore, s.facialExpressivenessScore, s.volumeScore]),
  };
  for (const k of Object.keys(out) as SkillId[]) if (out[k] == null) delete out[k];
  return out;
}

export function blendRepEvidence(local: SkillEvidence, cloud: SkillEvidence, source: CloudSource): SkillEvidence {
  const share = REVIEW_SHARE[source];
  const out: SkillEvidence = {};
  for (const skill of new Set([...Object.keys(local), ...Object.keys(cloud)] as SkillId[])) {
    const l = local[skill];
    const c = cloud[skill];
    out[skill] = l != null && c != null ? l * (1 - share) + c * share : (c ?? l)!;
  }
  return out;
}
