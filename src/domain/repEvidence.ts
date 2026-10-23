import type { SkillId } from "../theme/tokens";
import { headlineSheet, skillEvidence, type TakeScores } from "./scoring/takeScore";

// How one impromptu take moves skill mastery: a 0-1 result per skill, read
// straight from the take's score sheet (domain/scoring/takeScore.ts), so what
// a take scored in Cadence is what moves Cadence. The judged sheet is the
// ground truth when the take has one; otherwise the measured sheet. No
// blending of the two any more: the judge already had the measurements.
// Articulation and Conversation aren't scored on takes, so takes never move
// them. Pure.

export type SkillEvidence = Partial<Record<SkillId, number>>;

export interface RepEvidence {
  // What moves mastery.
  evidence: SkillEvidence;
  // Both layers, kept on each rating change for the skill detail screen.
  measured: SkillEvidence;
  judged: SkillEvidence;
}

export function repEvidence(scores: TakeScores): RepEvidence {
  return {
    evidence: skillEvidence(headlineSheet(scores)),
    measured: scores.measured ? skillEvidence(scores.measured) : {},
    judged: scores.judged ? skillEvidence(scores.judged) : {},
  };
}
