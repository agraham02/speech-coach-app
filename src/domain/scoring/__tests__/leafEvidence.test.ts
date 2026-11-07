import { ACTIVITY_IDS, activityOfDrill, drillActivityId, guidedActivityId, warmupActivityId } from "../../../content/activities";
import { effectiveWeight, unitTargetLeaf } from "../../../content/skillGrid";
import { drillSource, movesForAttempt } from "../leafEvidence";
import { takeEvidence, type TakeEvidenceInput } from "../takeEvidence";
import { STUTTER_EXCLUDED } from "../skillTree";

const byLeaf = (moves: ReturnType<typeof movesForAttempt>) => Object.fromEntries(moves.map((m) => [m.leaf, m.weight]));

describe("what an attempt moves", () => {
  it("moves every leaf in a drill's row, by its dots", () => {
    const moves = movesForAttempt({ activityId: drillActivityId("twister"), score: 0.8, difficulty: 3, source: "measured" });
    expect(byLeaf(moves)).toEqual({ speed_clarity: 1, read_accuracy: 0.5 });
    expect(moves.every((m) => m.score === 0.8)).toBe(true);
  });

  it("moves a content leaf lightly from a phone estimate and fully from a judge", () => {
    expect(byLeaf(movesForAttempt({ activityId: drillActivityId("word_chain"), score: 0.8, difficulty: 3, source: "phone_estimate" })).word_links).toBe(0.25);
    expect(byLeaf(movesForAttempt({ activityId: drillActivityId("word_chain"), score: 0.8, difficulty: 3, source: "judge" })).word_links).toBe(1);
  });

  it("never moves a performance leaf from a self-rating", () => {
    // Plan 6.4, rule 6, and section 16's validity test.
    expect(movesForAttempt({ activityId: guidedActivityId("gd_rate_contrast"), score: 1, difficulty: 3, source: "self" })).toEqual([]);
    expect(movesForAttempt({ activityId: drillActivityId("marked_reading"), score: 1, difficulty: 3, source: "self" })).toEqual([]);
  });

  it("moves an inner leaf from a self-rating", () => {
    expect(byLeaf(movesForAttempt({ activityId: guidedActivityId("gd_breath_reset"), score: 1, difficulty: 3, source: "self" }))).toEqual({ settling: 1 });
    // A guided exercise that moves both moves only the inner one.
    expect(byLeaf(movesForAttempt({ activityId: guidedActivityId("gd_reappraisal"), score: 1, difficulty: 3, source: "self" }))).toEqual({ settling: 0.5 });
    expect(effectiveWeight({ leaf: "real_world", weight: "main" }, "self")).toBe(1);
    expect(effectiveWeight({ leaf: "bouncing_back", weight: "main" }, "self")).toBe(0);
  });

  it("moves nothing on a leaf that doesn't count yet", () => {
    expect(movesForAttempt({ activityId: guidedActivityId("gd_inflection"), score: 1, difficulty: 3, source: "measured" })).toEqual([]);
  });

  it("moves it once previewed", () => {
    expect(byLeaf(movesForAttempt({ activityId: guidedActivityId("gd_inflection"), score: 1, difficulty: 3, source: "measured" }, { preview: { endings_fall: true } }))).toEqual({ endings_fall: 1 });
  });

  it("leaves out Fillers and Flow for someone who stutters", () => {
    const moves = movesForAttempt({ activityId: drillActivityId("just_a_minute"), score: 0.8, difficulty: 3, source: "measured" }, { excluded: STUTTER_EXCLUDED });
    expect(byLeaf(moves)).toEqual({ starting_fast: 0.5 });
  });

  it("moves nothing with no number, or for an activity with no row", () => {
    expect(movesForAttempt({ activityId: drillActivityId("twister"), score: null, difficulty: 3, source: "measured" })).toEqual([]);
    expect(movesForAttempt({ activityId: "nope", score: 1, difficulty: 3, source: "measured" })).toEqual([]);
    expect(movesForAttempt({ activityId: ACTIVITY_IDS.skillCheck, score: 1, difficulty: 3, source: "measured" })).toEqual([]);
  });

  it("gives a checkpoint its unit's target leaf, ×1.5", () => {
    const leaf = unitTargetLeaf("art_sounds")!;
    expect(byLeaf(movesForAttempt({ activityId: ACTIVITY_IDS.checkpoint, score: 0.8, difficulty: 3, source: "measured", targetLeaf: leaf }))).toEqual({ [leaf]: 1.5 });
  });

  it("doesn't move a Shadowing rhythm leaf until timing exists", () => {
    expect(byLeaf(movesForAttempt({ activityId: drillActivityId("shadowing"), score: 0.8, difficulty: 3, source: "measured" }))).toEqual({ read_accuracy: 0.5 });
    expect(byLeaf(movesForAttempt({ activityId: drillActivityId("shadowing"), score: 0.8, difficulty: 3, source: "measured", conditions: { timing_exists: true } }))).toEqual({ read_accuracy: 0.5, rhythm: 0.25 });
  });
});

describe("a take's evidence", () => {
  const readings = {
    speaking_rate: { score: 90, source: "measured" as const, value: "", rule: "" },
    point_first: { score: 100, source: "phone_estimate" as const, value: "", rule: "" },
    answers_question: { score: 80, source: "judge" as const, value: "", rule: "" },
    starting_fast: { score: 70, source: "measured" as const, value: "", rule: "" },
  };
  const input: TakeEvidenceInput = { activityId: ACTIVITY_IDS.impromptu, readings, lessonId: null, noPrep: true, hasTopic: true, messageScale: 1, feelingWords: null };
  const moves = (over: Partial<TakeEvidenceInput>) => movesForAttempt({ ...takeEvidence({ ...input, ...over }), difficulty: 3 });

  it("moves each leaf by its own number and its own source", () => {
    const planned = moves({});
    expect(Object.fromEntries(planned.map((m) => [m.leaf, m.score]))).toEqual({ speaking_rate: 0.9, point_first: 1, answers_question: 0.8, starting_fast: 0.7 });
    expect(byLeaf(planned)).toEqual({ speaking_rate: 1, point_first: 0.25, answers_question: 1, starting_fast: 1 });
  });

  it("counts Starting fast only with no prep", () => {
    expect(byLeaf(moves({ noPrep: false })).starting_fast).toBeUndefined();
  });

  it("gives Free record Answers the question only with a topic", () => {
    expect(byLeaf(moves({ activityId: ACTIVITY_IDS.freeRecord, hasTopic: false })).answers_question).toBeUndefined();
    expect(byLeaf(moves({ activityId: ACTIVITY_IDS.freeRecord, hasTopic: true })).answers_question).toBe(1);
  });

  it("moves the lesson's target leaf ×1.5", () => {
    expect(byLeaf(moves({ lessonId: "cad_1_pace" })).speaking_rate).toBe(1.5);
    expect(byLeaf(moves({ lessonId: "imp_14_angle" })).answers_question).toBe(1.5);
  });

  it("counts Message for less after research", () => {
    const planned = byLeaf(moves({ messageScale: 0.6 }));
    expect(planned.answers_question).toBeCloseTo(0.6);
    expect(planned.speaking_rate).toBe(1);
  });

  it("moves Within limits on a Concise take, and not on an impromptu one", () => {
    const withLimit = { ...readings, within_limits: { score: 80, source: "measured" as const, value: "", rule: "" } };
    expect(byLeaf(moves({ activityId: ACTIVITY_IDS.concise, readings: withLimit })).within_limits).toBe(1);
    expect(byLeaf(moves({ readings: withLimit })).within_limits).toBeUndefined();
  });

  it("gives a script no Message", () => {
    const planned = byLeaf(moves({ activityId: ACTIVITY_IDS.script }));
    expect(planned).toEqual({ speaking_rate: 1 });
  });

  it("counts feeling words, up to 5", () => {
    expect(moves({ activityId: ACTIVITY_IDS.feeling, readings: {}, feelingWords: 2 })[0]).toMatchObject({ leaf: "feeling_words", score: 0.4, weight: 1 });
    expect(moves({ activityId: ACTIVITY_IDS.feeling, readings: {}, feelingWords: 9 })[0].score).toBe(1);
  });
});

describe("who checks a drill", () => {
  it("is a phone estimate where the leaf is about meaning, measured otherwise", () => {
    expect(drillSource("word_chain")).toBe("phone_estimate");
    expect(drillSource("category_fluency")).toBe("phone_estimate");
    expect(drillSource("twister")).toBe("measured");
    expect(drillSource("conv_reply")).toBe("measured");
  });

  it("names a guided exercise or warm-up by its content", () => {
    expect(activityOfDrill("guided", "gd_recover")).toBe(guidedActivityId("gd_recover"));
    expect(activityOfDrill("warmup", "wu_hiss")).toBe(warmupActivityId("wu_hiss"));
    expect(activityOfDrill("twister")).toBe(drillActivityId("twister"));
  });
});
