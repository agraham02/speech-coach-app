import type { SkillId } from "../../theme/tokens";
import type { SessionScores } from "../sessionTypes";
import type { Provenance } from "../analysis/types";
import {
  convictionScore,
  emphasisScore,
  eyeContactScore,
  eyeContactTarget,
  fillerScore,
  hedgeCost,
  paceScore,
  PACE_BAND,
  pauseScore,
  PAUSE_FULL_RATE,
  pitchScore,
  PITCH_FULL_HZ,
  PITCH_FULL_SEMITONES,
  stallScore,
  stallsPerMinute,
  structureScore,
  expressionScore,
  EXPRESSION_FULL,
} from "./bands";
import { SKILL_DEFS, SUBCATEGORIES, SUBCATEGORY_ORDER, TAKE_SKILLS, type Layer, type SubcategoryId, type TakeKind } from "./taxonomy";

// A take's scores, in two layers (docs/decisions/scoring-taxonomy.md):
// - measured: the phone's measurements through the bands in bands.ts. Every
//   take has it, the formula is the same for everyone, so it is what free
//   takes are scored on and what trend lines compare.
// - judged: Tono AI's sub-scores, the ground truth on the takes that have
//   them. Where the judge scored a subcategory its score stands; where it
//   didn't (fluency, conviction), the measured sub-score fills in and says so.
// Category scores and the overall are always worked out here, from the
// sub-scores, with the taxonomy's weights: the summary can never disagree
// with its breakdown. Pure.

export const SCORE_SHEET_VERSION = 4;

// What the phone measured, flattened from the take's artifacts. Fields are
// null when not measured. Session 06's signals fill the optional ones.
export interface MeasuredFacts {
  takeKind: TakeKind;
  durationSeconds: number;
  wpm: number | null;
  boundaryPauseRate: number | null;
  pitchRangeSemitones?: number | null;
  pitchRangeHz: number | null;
  emphasisPeakSdDb?: number | null;
  // Null: not counted against this speaker (stutter mode) or no transcript.
  fillers: { hesitationPerMinute: number; contextualPerMinute: number | null } | null;
  stalls: number | null;
  structure: { framework: string; shaped: boolean; targetFramework: string | null } | null;
  hedges: number | null;
  strongEnding: boolean | null;
  // Null when the face wasn't measured or was out of frame most of the time.
  presence: { eyeContactPercent: number; eyeContactSource?: "gaze" | "head"; expressiveness: number } | null;
}

// One measured ingredient of a sub-score, explained.
export interface ScoreFactor {
  label: string;
  value: string;
  score?: number;
  delta?: number;
  rule: string;
}

export interface SubScore {
  id: SubcategoryId;
  label: string;
  score: number;
  // Where this number came from.
  layer: Layer;
  rollsUp: boolean;
  factors?: ScoreFactor[];
  // The judge's note: the evidence and what a 10 would take.
  notes?: string | null;
}

export interface CategoryScore {
  skill: SkillId;
  label: string;
  score: number;
  // Share of the overall, after leaving out absent skills.
  weight: number;
  subscores: SubScore[];
}

export interface ScoreSheet {
  layer: Layer;
  overall: number;
  categories: CategoryScore[];
}

export interface TakeScores {
  version: number;
  measured: ScoreSheet | null;
  judged: ScoreSheet | null;
  // Which sheet is the take's score: judged whenever it exists.
  headline: Layer;
  // Who judged it, for the label ("Judged by Tono AI").
  judgedBy?: Provenance;
}

// The judge's answer, by subcategory.
export type JudgedSubscores = Partial<Record<SubcategoryId, { score: number; notes: string | null }>>;

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp10 = (n: number) => Math.max(0, Math.min(10, n));

// --- measured sub-scores -----------------------------------------------------

type Measured = Partial<Record<SubcategoryId, { score: number; factors: ScoreFactor[] }>>;

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function measuredSubscores(f: MeasuredFacts): Measured {
  const out: Measured = {};

  if (f.wpm != null) {
    const wpm = Math.round(f.wpm);
    const score = round1(paceScore(wpm));
    out.pace = {
      score,
      factors: [
        {
          label: "Speaking rate",
          value: `${wpm} words a minute`,
          score,
          rule:
            wpm < PACE_BAND.low
              ? `Full marks between ${PACE_BAND.low} and ${PACE_BAND.high} words a minute. You were ${PACE_BAND.low - wpm} under, and every ${PACE_BAND.perPoint} under costs a point.`
              : wpm > PACE_BAND.high
                ? `Full marks between ${PACE_BAND.low} and ${PACE_BAND.high} words a minute. You were ${wpm - PACE_BAND.high} over, and every ${PACE_BAND.perPoint} over costs a point. A pause at each full stop slows you down without dragging.`
                : `Between ${PACE_BAND.low} and ${PACE_BAND.high} words a minute, where listeners follow easily: full marks.`,
        },
      ],
    };
  }

  if (f.boundaryPauseRate != null) {
    const rate = f.boundaryPauseRate;
    const score = round1(pauseScore(rate));
    out.pauses = {
      score,
      factors: [
        {
          label: "Pauses at full stops",
          value: `${Math.round(rate * 100)}% of sentence ends`,
          score,
          rule:
            rate >= PAUSE_FULL_RATE
              ? `You paused at most sentence ends: full marks from ${PAUSE_FULL_RATE * 100}% up.`
              : `Full marks once ${PAUSE_FULL_RATE * 100}% of your sentence ends get a pause. A beat at each full stop lets the point land.`,
        },
      ],
    };
  }

  const pitch = pitchScore({ semitones: f.pitchRangeSemitones, hz: f.pitchRangeHz });
  if (pitch != null) {
    const score = round1(pitch);
    const st = f.pitchRangeSemitones;
    out.melody = {
      score,
      factors: [
        st != null
          ? {
              label: "Pitch range",
              value: `${round1(st)} semitones`,
              score,
              rule: `Full marks at a ${PITCH_FULL_SEMITONES}-semitone range. A narrow range sounds flat; lift the key word in each sentence.`,
            }
          : {
              label: "Pitch range",
              value: `${Math.round(f.pitchRangeHz!)} Hz`,
              score,
              rule: `Full marks at a ${PITCH_FULL_HZ} Hz range. A narrow range sounds flat; lift the key word in each sentence.`,
            },
      ],
    };
  }

  if (f.emphasisPeakSdDb != null) {
    const score = round1(emphasisScore(f.emphasisPeakSdDb));
    out.emphasis = {
      score,
      factors: [
        {
          label: "Emphasis",
          value: `${round1(f.emphasisPeakSdDb)} dB`,
          score,
          rule: "How far your strongest syllables stand out. Full marks at 3 dB; lean on the word that carries the point.",
        },
      ],
    };
  }

  const fluency: ScoreFactor[] = [];
  if (f.fillers) {
    const { hesitationPerMinute: h, contextualPerMinute: c } = f.fillers;
    const score = round1(fillerScore(h, c ?? 0));
    fluency.push({
      label: c != null ? "Fillers" : "Filler words",
      value: c != null ? `${round1(h)} ums a minute, ${round1(c)} likes and actuallys` : `${round1(h)} a minute`,
      score,
      rule:
        "The first 2 a minute go unnoticed, and each one after costs 0.8. Words like \"like\" and \"actually\" count at half, since some of them aren't fillers. Swap \"um\" for a closed-mouth pause.",
    });
  }
  if (f.stalls != null) {
    const perMinute = stallsPerMinute(f.stalls, f.durationSeconds);
    fluency.push({
      label: "Stalls",
      value: `${f.stalls} (${round1(perMinute)} a minute)`,
      score: round1(stallScore(f.stalls, f.durationSeconds)),
      rule: "A stall is a long gap in the middle of a phrase, and each one a minute costs 2 points. Pausing between sentences is fine; only the mid-phrase gaps count.",
    });
  }
  const fluencyScore = mean(fluency.map((x) => x.score!));
  if (fluencyScore != null) out.fluency = { score: round1(fluencyScore), factors: fluency };

  if (f.structure && f.takeKind === "impromptu") {
    const { framework, shaped, targetFramework } = f.structure;
    const missedTarget = !!targetFramework && targetFramework !== "None" && framework !== targetFramework;
    const score = structureScore(shaped, missedTarget);
    const factors: ScoreFactor[] = [
      {
        label: "Shape",
        value: shaped ? framework : "None found",
        score: shaped ? 8 : 4,
        rule: shaped
          ? `The phone's rules recognised a clear shape (${framework}), which starts this at 8.`
          : "The phone's rules found no clear shape, which starts this at 4. Lead with your point, back it with a reason or an example, then say the point again.",
      },
    ];
    if (missedTarget && score < (shaped ? 8 : 4)) {
      factors.push({
        label: "Practice target",
        value: `Asked for ${targetFramework}`,
        delta: score - (shaped ? 8 : 4),
        rule: `This rep practices ${targetFramework}, and a different shape caps this at 5.`,
      });
    }
    out.structure = { score, factors };
  }

  if (f.takeKind === "impromptu" && (f.hedges != null || f.strongEnding != null)) {
    const hedges = f.hedges ?? 0;
    const score = round1(convictionScore(hedges, f.strongEnding));
    const factors: ScoreFactor[] = [];
    if (f.strongEnding === true) factors.push({ label: "Ending", value: "Clear", delta: 1, rule: "You ended on a clear statement instead of trailing off: +1 on a start of 8." });
    else if (f.strongEnding === false) factors.push({ label: "Ending", value: "Trailed off", delta: -2, rule: "The answer trailed off: -2 on a start of 8. Finish on your point, then stop talking." });
    const cost = hedgeCost(hedges);
    factors.push({
      label: "Hedges",
      value: `${hedges}`,
      delta: cost ? -cost : undefined,
      rule: cost
        ? "\"I think\", \"maybe\", \"I guess\": the first two are free, and each one after costs 0.5 (up to 3). Say it as if you mean it."
        : "\"I think\", \"maybe\", \"I guess\": the first two are free.",
    });
    out.conviction = { score, factors };
  }

  if (f.presence) {
    const p = f.presence;
    const eye = round1(eyeContactScore(p.eyeContactPercent, p.eyeContactSource));
    out.eye_contact = {
      score: eye,
      factors: [
        {
          label: "On the lens",
          value: `${Math.round(p.eyeContactPercent)}% of the time`,
          score: eye,
          rule: `Full marks at ${eyeContactTarget(p.eyeContactSource)}% of the time on the lens${p.eyeContactSource === "head" ? " (only the head direction was known, so the bar is higher)" : ""}.`,
        },
      ],
    };
    const face = round1(expressionScore(p.expressiveness));
    out.expression = {
      score: face,
      factors: [
        {
          label: "Expression",
          value: `${Math.round(p.expressiveness)} of 100`,
          score: face,
          rule: `Full marks once your face moves with what you're saying (${EXPRESSION_FULL} on this scale). A still face reads as flat, even with a lively voice.`,
        },
      ],
    };
  }

  return out;
}

// --- sheets -------------------------------------------------------------------

function applies(id: SubcategoryId, kind: TakeKind): boolean {
  return SUBCATEGORIES[id].appliesTo.includes(kind);
}

function buildSheet(layer: Layer, subs: SubScore[]): ScoreSheet | null {
  const categories: Omit<CategoryScore, "weight">[] = [];
  for (const skill of TAKE_SKILLS) {
    const own = subs.filter((s) => SUBCATEGORIES[s.id].skill === skill);
    const rolling = own.filter((s) => s.rollsUp);
    const totalWeight = rolling.reduce((sum, s) => sum + SUBCATEGORIES[s.id].weight, 0);
    if (!rolling.length || totalWeight <= 0) continue;
    const score = rolling.reduce((sum, s) => sum + s.score * SUBCATEGORIES[s.id].weight, 0) / totalWeight;
    categories.push({ skill, label: SKILL_DEFS[skill].label, score: round1(score), subscores: own });
  }
  if (!categories.length) return null;
  const total = categories.reduce((sum, c) => sum + SKILL_DEFS[c.skill].takeWeight, 0);
  const withWeights = categories.map((c) => ({ ...c, weight: SKILL_DEFS[c.skill].takeWeight / total }));
  const overall = withWeights.reduce((sum, c) => sum + c.score * c.weight, 0);
  return { layer, overall: round1(clamp10(overall)), categories: withWeights };
}

export function measuredSheet(facts: MeasuredFacts): ScoreSheet | null {
  const measured = measuredSubscores(facts);
  const subs: SubScore[] = [];
  for (const id of SUBCATEGORY_ORDER) {
    const m = measured[id];
    if (!m || !applies(id, facts.takeKind)) continue;
    subs.push({ id, label: SUBCATEGORIES[id].label, score: m.score, layer: "measured", rollsUp: SUBCATEGORIES[id].rollsUp, factors: m.factors });
  }
  return buildSheet("measured", subs);
}

// The judged sheet: the judge's sub-scores, with the measured ones filling
// the subcategories it doesn't score. Null when the judge scored nothing.
export function judgedSheet(judged: JudgedSubscores, facts: MeasuredFacts): ScoreSheet | null {
  const measured = measuredSubscores(facts);
  const subs: SubScore[] = [];
  let anyJudged = false;
  for (const id of SUBCATEGORY_ORDER) {
    if (!applies(id, facts.takeKind)) continue;
    const def = SUBCATEGORIES[id];
    const j = judged[id];
    if (j && Number.isFinite(j.score)) {
      anyJudged = true;
      subs.push({ id, label: def.label, score: round1(clamp10(j.score)), layer: "judged", rollsUp: def.rollsUp, notes: j.notes, factors: measured[id]?.factors });
      continue;
    }
    const m = measured[id];
    if (m) subs.push({ id, label: def.label, score: m.score, layer: "measured", rollsUp: def.rollsUp, factors: m.factors });
  }
  return anyJudged ? buildSheet("judged", subs) : null;
}

export function takeScores(facts: MeasuredFacts, judged: JudgedSubscores | null, judgedBy?: Provenance): TakeScores | null {
  const measured = measuredSheet(facts);
  const judgedOne = judged ? judgedSheet(judged, facts) : null;
  if (!measured && !judgedOne) return null;
  return {
    version: SCORE_SHEET_VERSION,
    measured,
    judged: judgedOne,
    headline: judgedOne ? "judged" : "measured",
    ...(judgedOne && judgedBy ? { judgedBy } : {}),
  };
}

export function headlineSheet(scores: TakeScores): ScoreSheet {
  return (scores.headline === "judged" ? scores.judged : scores.measured) ?? (scores.judged ?? scores.measured)!;
}

// What the stored review rubric (the `scores` row) says, by subcategory. The
// judge's own overall, the face-voice match and the archetype are left out:
// they were cut from the scores (taxonomy.ts CUT_FROM_SCORES).
export function judgedFromRubric(s: SessionScores, kind: TakeKind): JudgedSubscores {
  const out: JudgedSubscores = {
    pace: { score: s.rateScore, notes: s.rateNotes || null },
    pauses: { score: s.pausingScore, notes: s.pausingNotes || null },
    melody: { score: s.pitchMelodyScore, notes: s.pitchMelodyNotes || null },
    emphasis: { score: s.volumeScore, notes: s.volumeNotes || null },
    tone: { score: s.tonalityScore, notes: s.tonalityNotes || null },
    eye_contact: { score: s.eyeContactScore, notes: null },
    // The rubric's body-language note is about posture and gestures, not the
    // face, so it isn't hung on Expression; the Scores tab shows it as is.
    expression: { score: s.facialExpressivenessScore, notes: null },
  };
  if (kind === "impromptu") {
    out.structure = { score: s.structureScore, notes: s.structureNotes || null };
    out.relevance = { score: s.relevanceScore, notes: s.relevanceNotes || null };
    out.clarity = { score: s.coherenceScore, notes: s.coherenceNotes || null };
  }
  if (s.cueComplianceScore != null) out.cues = { score: s.cueComplianceScore, notes: s.cueComplianceNotes };
  return out;
}

// A sheet's score per skill, 0-1: what a take moves mastery by.
export function skillEvidence(sheet: ScoreSheet): Partial<Record<SkillId, number>> {
  const out: Partial<Record<SkillId, number>> = {};
  for (const c of sheet.categories) out[c.skill] = Math.max(0, Math.min(1, c.score / 10));
  return out;
}
