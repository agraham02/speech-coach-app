import { CUT_FROM_SCORES, METRICS, SKILL_DEFS, SUBCATEGORIES, SUBCATEGORY_ORDER, TAKE_SKILLS, subcategoriesOf } from "../scoring/taxonomy";
import { fillerScore, paceScore, pitchRangeBand, verdictFor } from "../scoring/bands";
import { headlineSheet, judgedFromRubric, judgedSheet, measuredSheet, skillEvidence, takeScores, type MeasuredFacts } from "../scoring/takeScore";
import { repEvidence } from "../repEvidence";
import type { SessionScores } from "../sessionTypes";

const facts = (patch: Partial<MeasuredFacts> = {}): MeasuredFacts => ({
  takeKind: "impromptu",
  durationSeconds: 60,
  wpm: 145,
  boundaryPauseRate: 0.6,
  pitchRangeSemitones: 5,
  fillers: { hesitationPerMinute: 1, contextualPerMinute: null },
  stalls: 0,
  structure: { framework: "PREP", shaped: true, targetFramework: null },
  hedges: 1,
  strongEnding: true,
  presence: { eyeContactPercent: 80, eyeContactSource: "gaze", expressiveness: 30 },
  ...patch,
});

const rubric = (patch: Partial<SessionScores> = {}): SessionScores => ({
  sessionId: "s1",
  structureScore: 5,
  structureUsed: "what/why/how",
  structureNotes: "Point came late.",
  relevanceScore: 6,
  relevanceNotes: "",
  coherenceScore: 6,
  coherenceNotes: "",
  rateScore: 6,
  rateWpmAvg: 150,
  rateNotes: "",
  volumeScore: 5,
  volumeNotes: "",
  pitchMelodyScore: 5,
  pitchMelodyNotes: "",
  tonalityScore: 2,
  tonalityNotes: "Flat for a happy story.",
  pausingScore: 6,
  pausingNotes: "",
  eyeContactScore: 6,
  facialExpressivenessScore: 5,
  bodyLanguageNotes: "",
  faceVoiceCongruenceScore: 1,
  archetypeDetected: "Friend",
  archetypeFitForTopic: "",
  overallScore: 9,
  coachingSummary: "",
  topStrength: "",
  topFocusArea: "",
  recommendedDrill: "",
  annotations: [],
  cueComplianceScore: null,
  cueComplianceNotes: null,
  ...patch,
});

describe("the taxonomy", () => {
  it("names every subcategory once, under a real skill, in the display order", () => {
    expect(new Set(SUBCATEGORY_ORDER).size).toBe(SUBCATEGORY_ORDER.length);
    expect([...SUBCATEGORY_ORDER].sort()).toEqual(Object.keys(SUBCATEGORIES).sort());
    for (const s of Object.values(SUBCATEGORIES)) expect(SKILL_DEFS[s.skill]).toBeDefined();
  });

  it("hangs every metric on a subcategory that exists", () => {
    for (const m of Object.values(METRICS)) expect(SUBCATEGORIES[m.subcategory]).toBeDefined();
  });

  it("scores takes in cadence, impromptu and confidence only, weights adding to 1", () => {
    expect(TAKE_SKILLS).toEqual(["cadence", "impromptu", "confidence"]);
    expect(TAKE_SKILLS.reduce((sum, s) => sum + SKILL_DEFS[s].takeWeight, 0)).toBeCloseTo(1);
  });

  it("keeps media-only judgements out of the totals, so text- and video-judged takes compare", () => {
    for (const s of Object.values(SUBCATEGORIES)) if (s.judged === "media") expect(s.rollsUp).toBe(false);
  });

  it("has no face-voice match, archetype or judge's own overall anywhere in the subcategories", () => {
    expect(Object.keys(CUT_FROM_SCORES)).toEqual(expect.arrayContaining(["congruence", "archetype", "model_overall"]));
    expect(subcategoriesOf("confidence").map((s) => s.id)).not.toContain("congruence");
  });
});

describe("bands", () => {
  it("scores the pace band and the free fillers", () => {
    expect(paceScore(145)).toBe(10);
    expect(paceScore(181)).toBe(7);
    expect(fillerScore(2)).toBe(10);
    expect(fillerScore(4)).toBeCloseTo(8.4);
  });

  it("weighs contextual fillers (like, actually) at half", () => {
    expect(fillerScore(2, 4)).toBeCloseTo(fillerScore(4));
  });

  it("turns a score into the coach card's verdict", () => {
    expect(verdictFor(9)).toBe("good");
    expect(verdictFor(6.5)).toBe("ok");
    expect(verdictFor(4)).toBe("work");
  });
});

describe("the measured sheet", () => {
  it("scores a strong take from the phone alone, with the reasons", () => {
    const sheet = measuredSheet(facts())!;
    expect(sheet.layer).toBe("measured");
    expect(sheet.overall).toBeGreaterThanOrEqual(9);
    const cadence = sheet.categories.find((c) => c.skill === "cadence")!;
    expect(cadence.subscores.map((s) => s.id)).toEqual(["pace", "pauses", "melody"]);
    expect(cadence.subscores[0].factors?.[0].value).toBe("145 words a minute");
  });

  it("is the weighted mean of its categories: the summary always agrees with its breakdown", () => {
    const sheet = measuredSheet(facts({ wpm: 190, fillers: { hesitationPerMinute: 8, contextualPerMinute: 2 } }))!;
    const mean = sheet.categories.reduce((sum, c) => sum + c.score * c.weight, 0);
    expect(sheet.overall).toBeCloseTo(mean, 0);
    expect(sheet.categories.reduce((sum, c) => sum + c.weight, 0)).toBeCloseTo(1);
  });

  it("leaves out what wasn't measured, and the face when it was mostly out of frame", () => {
    const sheet = measuredSheet(facts({ presence: null, fillers: null, stalls: null }))!;
    expect(sheet.categories.map((c) => c.skill)).toEqual(["cadence", "impromptu", "confidence"]);
    expect(sheet.categories.find((c) => c.skill === "confidence")!.subscores.map((s) => s.id)).toEqual(["conviction"]);
    expect(measuredSheet(facts({ wpm: null, boundaryPauseRate: null, pitchRangeSemitones: null, fillers: null, stalls: null, structure: null, hedges: null, strongEnding: null, presence: null }))).toBeNull();
  });

  it("scores a scripted reading without structure or conviction", () => {
    const sheet = measuredSheet(facts({ takeKind: "script" }))!;
    const ids = sheet.categories.flatMap((c) => c.subscores.map((s) => s.id));
    expect(ids).not.toContain("structure");
    expect(ids).not.toContain("conviction");
    expect(ids).toContain("fluency");
  });

  it("scores pitch variety in semitones on the fixed band", () => {
    const sheet = measuredSheet(facts({ pitchRangeSemitones: 2.75 }))!;
    const melody = sheet.categories[0].subscores.find((s) => s.id === "melody")!;
    expect(melody.score).toBe(4.5);
    expect(melody.factors?.[0].value).toBe("2.8 semitones");
  });

  it("scores pitch variety on your own band after 5 takes", () => {
    const pitchBand = pitchRangeBand([2, 2.2, 2.1, 1.9, 2.4]);
    const melody = measuredSheet(facts({ pitchRangeSemitones: 4, pitchBand }))!.categories[0].subscores.find((s) => s.id === "melody")!;
    expect(melody.score).toBe(10);
    expect(melody.factors?.[0].rule).toMatch(/a little over your usual 2.1/);
  });

  it("counts contextual fillers at half and shows the two kinds apart", () => {
    const sheet = measuredSheet(facts({ fillers: { hesitationPerMinute: 2, contextualPerMinute: 4 } }))!;
    const fluency = sheet.categories.flatMap((c) => c.subscores).find((s) => s.id === "fluency")!;
    expect(fluency.factors?.[0].score).toBe(fillerScore(2, 4));
    expect(fluency.factors?.[0].value).toMatch(/2 ums a minute, 4 likes/);
  });
});

describe("the judged sheet", () => {
  it("is the ground truth where the judge scored, and fills the rest from the phone", () => {
    const sheet = judgedSheet(judgedFromRubric(rubric(), "impromptu"), facts())!;
    const impromptu = sheet.categories.find((c) => c.skill === "impromptu")!;
    expect(impromptu.subscores.find((s) => s.id === "structure")).toMatchObject({ score: 5, layer: "judged", notes: "Point came late." });
    expect(impromptu.subscores.find((s) => s.id === "fluency")).toMatchObject({ layer: "measured" });
  });

  it("ignores the judge's own overall, the face-voice match and the archetype", () => {
    const a = judgedSheet(judgedFromRubric(rubric({ overallScore: 9, faceVoiceCongruenceScore: 1 }), "impromptu"), facts())!;
    const b = judgedSheet(judgedFromRubric(rubric({ overallScore: 2, faceVoiceCongruenceScore: 10, archetypeDetected: "Coach" }), "impromptu"), facts())!;
    expect(a.overall).toBe(b.overall);
  });

  it("shows tone fit but keeps it out of the total", () => {
    const low = judgedSheet(judgedFromRubric(rubric({ tonalityScore: 1 }), "impromptu"), facts())!;
    const high = judgedSheet(judgedFromRubric(rubric({ tonalityScore: 10 }), "impromptu"), facts())!;
    expect(low.overall).toBe(high.overall);
    expect(low.categories[0].subscores.find((s) => s.id === "tone")).toMatchObject({ score: 1, rollsUp: false });
  });

  it("drops structure, relevance and clarity for a scripted reading, and counts the marks", () => {
    const judged = judgedFromRubric(rubric({ cueComplianceScore: 8, cueComplianceNotes: "Held the long pauses." }), "script");
    expect(judged.structure).toBeUndefined();
    const sheet = judgedSheet(judged, facts({ takeKind: "script" }))!;
    expect(sheet.categories[0].subscores.find((s) => s.id === "cues")).toMatchObject({ score: 8, rollsUp: true });
  });
});

describe("a take's two layers", () => {
  it("leads with the judged sheet whenever there is one", () => {
    const both = takeScores(facts(), judgedFromRubric(rubric(), "impromptu"))!;
    expect(both.headline).toBe("judged");
    expect(headlineSheet(both)).toBe(both.judged);
    expect(both.measured!.overall).toBeGreaterThan(both.judged!.overall);
    const measuredOnly = takeScores(facts(), null)!;
    expect(measuredOnly.headline).toBe("measured");
    expect(measuredOnly.judged).toBeNull();
  });

  it("moves mastery by the headline sheet's skill scores, keeping both layers for the record", () => {
    const scores = takeScores(facts(), judgedFromRubric(rubric(), "impromptu"))!;
    const { evidence, measured, judged } = repEvidence(scores);
    expect(evidence).toEqual(skillEvidence(scores.judged!));
    expect(evidence.impromptu).toBeLessThan(measured.impromptu!);
    expect(judged).toEqual(evidence);
    expect(evidence.articulation).toBeUndefined();
  });
});
