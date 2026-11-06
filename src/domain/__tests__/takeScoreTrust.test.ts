import { METRICS, SUBCATEGORY_READING, type SubcategoryId } from "../scoring/taxonomy";
import { judgedSheet, measuredSheet, SCORE_SHEET_VERSION, takeScores, type JudgedSubscores, type MeasuredFacts } from "../scoring/takeScore";
import { READINGS, readingCounts, trustLabel, type ReadingId, type ReadingPreview } from "../signalLab/readingTrust";

// A reading that isn't proven doesn't count towards a score
// (docs/overhaul/PLAN.md, 6.2 and 6.5). The expected numbers below are worked
// out by hand from the bands in scoring/bands.ts and the weights in
// scoring/taxonomy.ts, not copied from the output.
//
// The take: pace 145 wpm = 10. Pauses 0.3 of sentence ends / 0.6 * 10 = 5.
// Pitch 3 st on the fixed band (1 to 5) = (3 - 1) / 4 * 10 = 5. Emphasis 2.2 dB
// = (2.2 - 1) / 2 * 10 = 6. Fluency: 1 um a minute (free) and no stalls = 10.
// Structure PREP = 8. Conviction: 2 hedges (free), clear ending = 8 + 1 = 9.
// Eye contact 45% / 75% * 10 = 6. Expression 12 / 30 * 10 = 4.
// Category weights: cadence 0.3, impromptu 0.45, confidence 0.25. Inside
// confidence: eye contact 1.2, expression 1, conviction 0.8.

const facts = (patch: Partial<MeasuredFacts> = {}): MeasuredFacts => ({
  takeKind: "impromptu",
  durationSeconds: 60,
  wpm: 145,
  boundaryPauseRate: 0.3,
  pitchRangeSemitones: 3,
  emphasisPeakSdDb: 2.2,
  fillers: { hesitationPerMinute: 1, contextualPerMinute: null },
  stalls: 0,
  structure: { framework: "PREP", shaped: true, targetFramework: null },
  hedges: 2,
  strongEnding: true,
  presence: { eyeContactPercent: 45, eyeContactSource: "gaze", expressiveness: 12 },
  ...patch,
});

const script = (patch: Partial<MeasuredFacts> = {}) => facts({ takeKind: "script", structure: null, hedges: null, strongEnding: null, ...patch });

const FIVE: { sub: SubcategoryId; reading: ReadingId }[] = [
  { sub: "pauses", reading: "sentence_end_pauses" },
  { sub: "melody", reading: "pitch_variety" },
  { sub: "emphasis", reading: "stand_out_stress" },
  { sub: "eye_contact", reading: "on_the_lens" },
  { sub: "expression", reading: "face_movement" },
];

const ALL_ON: ReadingPreview = Object.fromEntries(FIVE.map((f) => [f.reading, true]));
// Everything on except one reading.
const allBut = (reading: ReadingId): ReadingPreview => ({ ...ALL_ON, [reading]: false });

const score = (sheet: ReturnType<typeof measuredSheet>, skill: string) => sheet!.categories.find((c) => c.skill === skill)?.score;
const weight = (sheet: ReturnType<typeof measuredSheet>, skill: string) => sheet!.categories.find((c) => c.skill === skill)?.weight;
const sub = (sheet: ReturnType<typeof measuredSheet>, id: SubcategoryId) => sheet!.categories.flatMap((c) => c.subscores).find((s) => s.id === id)!;
// The overall is rounded to a tenth from rounded category scores, so compare within a tenth.
const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(0.051);

describe("the registry and the taxonomy agree", () => {
  it("maps each of the five sub-scores to its reading", () => {
    expect(SUBCATEGORY_READING).toEqual({
      pauses: "sentence_end_pauses",
      melody: "pitch_variety",
      emphasis: "stand_out_stress",
      eye_contact: "on_the_lens",
      expression: "face_movement",
    });
  });

  it("scores a metric only when its reading counts", () => {
    const metricOf: Record<string, string> = { pauses: "boundary_pauses", melody: "pitch_range", emphasis: "emphasis_peaks", eye_contact: "eye_contact", expression: "expressiveness" };
    for (const { sub: id, reading } of FIVE) {
      expect(readingCounts(reading)).toBe(false);
      expect(METRICS[metricOf[id] as keyof typeof METRICS].scored).toBe(false);
    }
    // The metrics that still count aren't gated by a reading.
    expect(METRICS.speaking_rate.scored).toBe(true);
    expect(METRICS.hedges.scored).toBe(true);
  });

  it("is on sheet version 6", () => {
    expect(SCORE_SHEET_VERSION).toBe(6);
    expect(takeScores(facts(), null)!.version).toBe(6);
  });
});

describe("an impromptu take", () => {
  it("counts everything when every reading counts: 6.5, 9 and 6.1 give 7.5", () => {
    // Cadence (10 + 5 + 5 + 6) / 4 = 6.5. Impromptu (10 + 8) / 2 = 9.
    // Confidence (6 * 1.2 + 4 * 1 + 9 * 0.8) / 3 = 18.4 / 3 = 6.133, shown 6.1.
    const sheet = measuredSheet(facts(), ALL_ON)!;
    expect([score(sheet, "cadence"), score(sheet, "impromptu"), score(sheet, "confidence")]).toEqual([6.5, 9, 6.1]);
    expect([weight(sheet, "cadence"), weight(sheet, "impromptu"), weight(sheet, "confidence")]).toEqual([0.3, 0.45, 0.25]);
    // 6.5 * 0.3 + 9 * 0.45 + 6.1 * 0.25 = 1.95 + 4.05 + 1.525 = 7.525
    near(sheet.overall, 7.525);
    expect(FIVE.every((f) => sub(sheet, f.sub).rollsUp && sub(sheet, f.sub).trust === undefined)).toBe(true);
  });

  it("leaves all five out today: they are shown, labelled, and the rest carry the weight", () => {
    // Cadence is pace alone, 10. Impromptu is still 9. Confidence is conviction alone, 9.
    const sheet = measuredSheet(facts())!;
    expect([score(sheet, "cadence"), score(sheet, "impromptu"), score(sheet, "confidence")]).toEqual([10, 9, 9]);
    // No category is empty, so the weights hold. 10 * 0.3 + 9 * 0.45 + 9 * 0.25 = 3 + 4.05 + 2.25 = 9.3
    expect([weight(sheet, "cadence"), weight(sheet, "impromptu"), weight(sheet, "confidence")]).toEqual([0.3, 0.45, 0.25]);
    near(sheet.overall, 9.3);
    // Still computed and still there.
    expect(sub(sheet, "pauses")).toMatchObject({ score: 5, rollsUp: false, trust: "probation" });
    expect(sub(sheet, "melody")).toMatchObject({ score: 5, rollsUp: false, trust: "probation" });
    expect(sub(sheet, "emphasis")).toMatchObject({ score: 6, rollsUp: false, trust: "probation" });
    expect(sub(sheet, "eye_contact")).toMatchObject({ score: 6, rollsUp: false, trust: "tuning" });
    expect(sub(sheet, "expression")).toMatchObject({ score: 4, rollsUp: false, trust: "tuning" });
    // Reading-free sub-scores carry no label.
    expect(sub(sheet, "pace")).toMatchObject({ rollsUp: true });
    expect(sub(sheet, "pace").trust).toBeUndefined();
    expect(sub(sheet, "conviction").trust).toBeUndefined();
  });

  it("reads the label from the registry", () => {
    expect(trustLabel(READINGS.sentence_end_pauses.status)).toBe("Beta · not proven yet");
    expect(trustLabel(READINGS.on_the_lens.status)).toBe("Beta · being tuned");
  });

  // Each reading dropped on its own, the other four counting.
  it.each([
    { reading: "sentence_end_pauses" as const, skill: "cadence", expected: 7 }, // (10 + 5 + 6) / 3
    { reading: "pitch_variety" as const, skill: "cadence", expected: 7 }, // (10 + 5 + 6) / 3
    { reading: "stand_out_stress" as const, skill: "cadence", expected: 6.7 }, // (10 + 5 + 5) / 3 = 6.667
    { reading: "on_the_lens" as const, skill: "confidence", expected: 6.2 }, // (4 * 1 + 9 * 0.8) / 1.8 = 11.2 / 1.8 = 6.222
    { reading: "face_movement" as const, skill: "confidence", expected: 7.2 }, // (6 * 1.2 + 9 * 0.8) / 2 = 14.4 / 2
  ])("drops $reading out of $skill alone, and the rest share its weight", ({ reading, skill, expected }) => {
    const sheet = measuredSheet(facts(), allBut(reading))!;
    expect(score(sheet, skill)).toBe(expected);
    const dropped = FIVE.find((f) => f.reading === reading)!.sub;
    expect(sub(sheet, dropped).rollsUp).toBe(false);
    expect(sub(sheet, dropped).trust).toBeDefined();
    // The other categories are untouched.
    const base = measuredSheet(facts(), ALL_ON)!;
    for (const c of ["cadence", "impromptu", "confidence"].filter((c) => c !== skill)) expect(score(sheet, c)).toBe(score(base, c));
  });

  it("is the weighted mean of its categories whichever readings count", () => {
    for (const preview of [undefined, ALL_ON, allBut("on_the_lens")]) {
      const sheet = measuredSheet(facts(), preview)!;
      near(sheet.overall, sheet.categories.reduce((sum, c) => sum + c.score * c.weight, 0));
      expect(sheet.categories.reduce((sum, c) => sum + c.weight, 0)).toBeCloseTo(1);
    }
  });
});

describe("a script take", () => {
  it("counts everything when every reading counts", () => {
    // Cadence 6.5 as above. Impromptu is fluency alone, 10.
    // Confidence (6 * 1.2 + 4 * 1) / 2.2 = 11.2 / 2.2 = 5.09, shown 5.1.
    const sheet = measuredSheet(script(), ALL_ON)!;
    expect([score(sheet, "cadence"), score(sheet, "impromptu"), score(sheet, "confidence")]).toEqual([6.5, 10, 5.1]);
    expect([weight(sheet, "cadence"), weight(sheet, "impromptu"), weight(sheet, "confidence")]).toEqual([0.3, 0.45, 0.25]);
    // 6.5 * 0.3 + 10 * 0.45 + 5.1 * 0.25 = 1.95 + 4.5 + 1.275 = 7.725
    near(sheet.overall, 7.725);
  });

  it("drops confidence entirely today, and the others renormalise to 0.4 and 0.6", () => {
    // Eye contact and expression are all a script take has in confidence, so
    // the category is dropped. Cadence is pace alone, 10; impromptu is fluency, 10.
    const sheet = measuredSheet(script())!;
    expect(sheet.categories.map((c) => c.skill)).toEqual(["cadence", "impromptu"]);
    // 0.3 / 0.75 and 0.45 / 0.75
    expect(weight(sheet, "cadence")).toBeCloseTo(0.4);
    expect(weight(sheet, "impromptu")).toBeCloseTo(0.6);
    expect(sheet.overall).toBe(10);
    // The beta numbers are still on the cadence sub-scores.
    expect(sub(sheet, "pauses")).toMatchObject({ score: 5, trust: "probation" });
  });

  it.each([
    { reading: "sentence_end_pauses" as const, expected: 7 },
    { reading: "pitch_variety" as const, expected: 7 },
    { reading: "stand_out_stress" as const, expected: 6.7 },
  ])("drops $reading from cadence and leaves the rest sharing it", ({ reading, expected }) => {
    const sheet = measuredSheet(script(), allBut(reading))!;
    expect(score(sheet, "cadence")).toBe(expected);
  });

  it("keeps confidence on one face reading: eye contact alone is 6, expression alone is 4", () => {
    expect(score(measuredSheet(script(), allBut("face_movement")), "confidence")).toBe(6);
    expect(score(measuredSheet(script(), allBut("on_the_lens")), "confidence")).toBe(4);
    // Cadence 6.5, impromptu 10, confidence 6: 1.95 + 4.5 + 1.5 = 7.95
    near(measuredSheet(script(), allBut("face_movement"))!.overall, 7.95);
  });

  it("drops confidence when both face readings are off even with the voice ones on", () => {
    const sheet = measuredSheet(script(), { ...ALL_ON, on_the_lens: false, face_movement: false })!;
    expect(sheet.categories.map((c) => c.skill)).toEqual(["cadence", "impromptu"]);
    expect(weight(sheet, "cadence")).toBeCloseTo(0.4);
    // 6.5 * 0.4 + 10 * 0.6 = 2.6 + 6 = 8.6
    near(sheet.overall, 8.6);
  });
});

describe("a take where only unproven readings were measured", () => {
  const onlyVoice = facts({ wpm: null, fillers: null, stalls: null, structure: null, hedges: null, strongEnding: null, presence: null });
  const onlyFace = script({ wpm: null, boundaryPauseRate: null, pitchRangeSemitones: null, emphasisPeakSdDb: null, fillers: null, stalls: null });

  it("has no score today, rather than one built on nothing that counts", () => {
    expect(measuredSheet(onlyVoice)).toBeNull();
    expect(measuredSheet(onlyFace)).toBeNull();
    expect(takeScores(onlyVoice, null)).toBeNull();
  });

  it("scores from the one reading a preview turns on", () => {
    // Eye contact alone: confidence 6, the only category, so it carries the whole weight.
    const sheet = measuredSheet(onlyFace, { on_the_lens: true })!;
    expect(sheet.categories.map((c) => c.skill)).toEqual(["confidence"]);
    expect(weight(sheet, "confidence")).toBe(1);
    expect(sheet.overall).toBe(6);
    // Expression is still shown, as beta.
    expect(sub(sheet, "expression")).toMatchObject({ score: 4, rollsUp: false, trust: "tuning" });
  });

  it("keeps a take's counted readings and shows the unproven ones beside them", () => {
    const sheet = measuredSheet(facts({ fillers: null, stalls: null, structure: null, hedges: null, strongEnding: null, presence: null }))!;
    expect(sheet.categories.map((c) => c.skill)).toEqual(["cadence"]);
    expect(weight(sheet, "cadence")).toBe(1);
    expect(sheet.overall).toBe(10);
    expect(sheet.categories[0].subscores.map((s) => s.id)).toEqual(["pace", "pauses", "melody", "emphasis"]);
  });
});

describe("the preview", () => {
  it("turns a single reading back on, and only that one", () => {
    const base = measuredSheet(facts())!;
    const on = measuredSheet(facts(), { sentence_end_pauses: true })!;
    // Cadence (10 + 5) / 2 = 7.5, up from pace alone at 10 going down.
    expect(score(on, "cadence")).toBe(7.5);
    expect(sub(on, "pauses")).toMatchObject({ rollsUp: true });
    expect(sub(on, "pauses").trust).toBeUndefined();
    expect(sub(on, "melody")).toMatchObject({ rollsUp: false, trust: "probation" });
    expect(score(on, "cadence")).not.toBe(score(base, "cadence"));
    // Face and the rest unchanged.
    expect(score(on, "confidence")).toBe(score(base, "confidence"));
  });

  it("does nothing when it says false or is empty", () => {
    const base = measuredSheet(facts())!;
    expect(measuredSheet(facts(), {})).toEqual(base);
    expect(measuredSheet(facts(), { pitch_variety: false })).toEqual(base);
    // A reading that no sub-score maps to changes nothing.
    expect(measuredSheet(facts(), { volume_carry: true, endings_fall: true })).toEqual(base);
  });

  it("passes through takeScores to both sheets", () => {
    const scores = takeScores(facts(), { structure: { score: 5, notes: null } }, undefined, { pitch_variety: true })!;
    expect(sub(scores.measured, "melody").rollsUp).toBe(true);
    expect(sub(scores.judged, "melody").rollsUp).toBe(true);
    expect(sub(takeScores(facts(), { structure: { score: 5, notes: null } })!.judged, "melody").rollsUp).toBe(false);
  });
});

describe("the judged sheet", () => {
  // Pace 8, pauses 9, pitch 3, emphasis 6, structure 5, relevance 6, clarity 7,
  // eye contact 2, expression 10. Fluency and conviction come from the phone: 10 and 9.
  const judged: JudgedSubscores = {
    pace: { score: 8, notes: null },
    pauses: { score: 9, notes: "Held every full stop." },
    melody: { score: 3, notes: null },
    emphasis: { score: 6, notes: null },
    structure: { score: 5, notes: null },
    relevance: { score: 6, notes: null },
    clarity: { score: 7, notes: null },
    eye_contact: { score: 2, notes: null },
    expression: { score: 10, notes: null },
  };

  it("stops counting the judge's scores for the five, but still shows them", () => {
    const sheet = judgedSheet(judged, facts())!;
    // Cadence is the judge's pace alone, 8. Impromptu (5 + 6 + 7 + 10) / 4 = 7.
    // Confidence is the phone's conviction alone, 9: the judge's eye contact and expression are out.
    expect([score(sheet, "cadence"), score(sheet, "impromptu"), score(sheet, "confidence")]).toEqual([8, 7, 9]);
    // 8 * 0.3 + 7 * 0.45 + 9 * 0.25 = 2.4 + 3.15 + 2.25 = 7.8
    near(sheet.overall, 7.8);
    expect(sub(sheet, "pauses")).toMatchObject({ score: 9, layer: "judged", rollsUp: false, trust: "probation", notes: "Held every full stop." });
    expect(sub(sheet, "eye_contact")).toMatchObject({ score: 2, layer: "judged", rollsUp: false, trust: "tuning" });
    expect(sub(sheet, "expression")).toMatchObject({ score: 10, layer: "judged", rollsUp: false, trust: "tuning" });
  });

  it("counts them again under the preview", () => {
    // Cadence (8 + 9 + 3 + 6) / 4 = 6.5. Confidence (2 * 1.2 + 10 * 1 + 9 * 0.8) / 3 = 19.6 / 3 = 6.53, shown 6.5.
    const sheet = judgedSheet(judged, facts(), ALL_ON)!;
    expect([score(sheet, "cadence"), score(sheet, "impromptu"), score(sheet, "confidence")]).toEqual([6.5, 7, 6.5]);
    // 6.5 * 0.3 + 7 * 0.45 + 6.5 * 0.25 = 1.95 + 3.15 + 1.625 = 6.725
    near(sheet.overall, 6.725);
    expect(sub(sheet, "pauses").trust).toBeUndefined();
  });

  it("drops a script take's confidence when the judge scored only unproven face readings", () => {
    const sheet = judgedSheet({ eye_contact: { score: 3, notes: null }, expression: { score: 4, notes: null } }, script())!;
    // Cadence is the phone's pace, 10; impromptu is fluency, 10; confidence is gone.
    expect(sheet.categories.map((c) => c.skill)).toEqual(["cadence", "impromptu"]);
    expect(sheet.overall).toBe(10);
  });
});
