import { doneStepsByPlan, lessonIsComplete, lessonProgress, lessonScore, openStepFor, type ActivityEntry, type PlanRef } from "../activityLog";
import { ACTIVITY_IDS } from "../../content/activities";
import type { LessonStep } from "../../content/lessons";

let n = 0;
function entry(over: Partial<ActivityEntry> & { activityId: string }): ActivityEntry {
  n += 1;
  return {
    id: `e${n}`,
    kind: "drill",
    variant: null,
    outcome: "done",
    at: `2026-11-06T10:${String(n % 60).padStart(2, "0")}:00.000Z`,
    localDate: "2026-11-06",
    score: null,
    sessionId: null,
    planDate: null,
    planSlot: null,
    planStepId: null,
    lessonId: null,
    lessonStepIndex: null,
    ...over,
  };
}

const twister: LessonStep = { kind: "drill", drill: "twister" };
const rep: LessonStep = { kind: "rep", focus: "x" };

const main: PlanRef = {
  date: "2026-11-06",
  slot: 0,
  steps: [
    { id: "0", kind: "warmup", lessonStep: { kind: "warmup", warmupId: "wu_sigh" } },
    { id: "1", kind: "drill", lessonStep: twister },
    { id: "2", kind: "rep", lessonStep: rep },
    { id: "3", kind: "review" },
  ],
};

describe("plan steps from the log", () => {
  it("ticks nothing when nothing was done", () => {
    expect([...doneStepsByPlan([main], [])[0]]).toEqual([]);
  });

  it("ticks a step when its activity was done anywhere that day", () => {
    const done = doneStepsByPlan([main], [entry({ activityId: "drill:twister" })])[0];
    expect([...done]).toEqual(["1"]);
  });

  it("ticks a step done from the plan itself", () => {
    const done = doneStepsByPlan([main], [entry({ activityId: "warmup:wu_sigh", planDate: "2026-11-06", planStepId: "0" })])[0];
    expect([...done]).toEqual(["0"]);
  });

  it("does not tick for another day's activity", () => {
    const done = doneStepsByPlan([main], [entry({ activityId: "drill:twister", localDate: "2026-11-05" })])[0];
    expect(done.size).toBe(0);
  });

  it("ticks the review step from a review", () => {
    expect([...doneStepsByPlan([main], [entry({ activityId: ACTIVITY_IDS.review })])[0]]).toEqual(["3"]);
  });

  it("counts a skip for that step only, and lets nothing else tick", () => {
    const skipped = entry({ activityId: "drill:twister", outcome: "skipped", planDate: "2026-11-06", planStepId: "1" });
    const done = doneStepsByPlan([main], [skipped])[0];
    expect([...done]).toEqual(["1"]);
    // A skip is not the activity: it does not tick another plan's matching step.
    const topUp: PlanRef = { date: "2026-11-06", slot: 1, steps: [{ id: "0", kind: "drill", lessonStep: twister }] };
    const both = doneStepsByPlan([main, topUp], [skipped]);
    expect(both[1].size).toBe(0);
  });

  it("needs a second rep for a second rep step", () => {
    const twoReps: PlanRef = {
      ...main,
      steps: [
        { id: "0", kind: "rep", lessonStep: rep },
        { id: "1", kind: "rep", lessonStep: rep },
      ],
    };
    expect([...doneStepsByPlan([twoReps], [entry({ activityId: ACTIVITY_IDS.impromptu })])[0]]).toEqual(["0"]);
    expect([...doneStepsByPlan([twoReps], [entry({ activityId: ACTIVITY_IDS.impromptu }), entry({ activityId: ACTIVITY_IDS.impromptu })])[0]]).toEqual(["0", "1"]);
  });

  it("gives a free activity to the daily plan before a top-up, once", () => {
    const topUp: PlanRef = { date: "2026-11-06", slot: 1, steps: [{ id: "0", kind: "drill", lessonStep: twister }] };
    const result = doneStepsByPlan([topUp, main], [entry({ activityId: "drill:twister" })]);
    expect([...result[0]]).toEqual(["1"]);
    expect(result[1].size).toBe(0);
  });

  it("keeps a top-up's own activity out of the daily plan", () => {
    const topUp: PlanRef = { date: "2026-11-06", slot: 1, steps: [{ id: "0", kind: "drill", lessonStep: twister }] };
    const result = doneStepsByPlan([main, topUp], [entry({ activityId: "drill:twister", planDate: "2026-11-06", planSlot: 1, planStepId: "0" })]);
    expect(result[0].size).toBe(0);
    expect([...result[1]]).toEqual(["0"]);
  });

  it("meets a named structure only with that structure", () => {
    const prep: PlanRef = { ...main, steps: [{ id: "0", kind: "rep", lessonStep: { kind: "rep", framework: "PREP", focus: "x" } }] };
    expect(doneStepsByPlan([prep], [entry({ activityId: ACTIVITY_IDS.impromptu })])[0].size).toBe(0);
    expect(doneStepsByPlan([prep], [entry({ activityId: ACTIVITY_IDS.impromptu, variant: "PREP" })])[0].size).toBe(1);
  });
});

describe("lesson steps from the log", () => {
  const forLesson = (idx: number, score: number | null, at: string) => entry({ activityId: "drill:twister", lessonId: "L", lessonStepIndex: idx, score, at });

  it("keeps a step done across days", () => {
    const p = lessonProgress("L", [forLesson(0, 0.9, "2026-11-01T10:00:00.000Z")], null);
    expect([...p.done]).toEqual([0]);
  });

  it("is complete only when every step is done", () => {
    const some = lessonProgress("L", [forLesson(0, 1, "2026-11-01T10:00:00.000Z"), forLesson(2, 1, "2026-11-02T10:00:00.000Z")], null);
    expect(lessonIsComplete(3, some)).toBe(false);
    const all = lessonProgress("L", [forLesson(0, 1, "2026-11-01T10:00:00.000Z"), forLesson(1, 1, "2026-11-01T11:00:00.000Z"), forLesson(2, 1, "2026-11-02T10:00:00.000Z")], null);
    expect(lessonIsComplete(3, all)).toBe(true);
    expect(lessonIsComplete(0, lessonProgress("L", [], null))).toBe(false);
  });

  it("starts over after the lesson was completed, for a review", () => {
    const entries = [forLesson(0, 1, "2026-11-01T10:00:00.000Z"), forLesson(0, 0.5, "2026-11-09T10:00:00.000Z")];
    const review = lessonProgress("L", entries, "2026-11-05T00:00:00.000Z");
    expect([...review.done]).toEqual([0]);
    expect(review.scores.get(0)).toBe(0.5);
  });

  it("ignores skips, other lessons and entries with no step", () => {
    const entries = [
      entry({ activityId: "drill:twister", lessonId: "L", lessonStepIndex: 0, outcome: "skipped" }),
      entry({ activityId: "drill:twister", lessonId: "M", lessonStepIndex: 1 }),
      entry({ activityId: "drill:twister", lessonId: "L", lessonStepIndex: null }),
    ];
    expect(lessonProgress("L", entries, null).done.size).toBe(0);
  });

  it("scores a lesson with the real average of its scored steps", () => {
    const p = lessonProgress("L", [forLesson(0, 0.9, "2026-11-01T10:00:00.000Z"), forLesson(1, 0.5, "2026-11-01T11:00:00.000Z"), forLesson(2, null, "2026-11-01T12:00:00.000Z")], null);
    expect(lessonScore(3, p)).toBeCloseTo(0.7);
  });

  it("lets a later score replace an earlier one, but a later unscored try keeps it", () => {
    const retry = lessonProgress("L", [forLesson(0, 0.4, "2026-11-01T10:00:00.000Z"), forLesson(0, 0.8, "2026-11-01T11:00:00.000Z")], null);
    expect(retry.scores.get(0)).toBe(0.8);
    const unscored = lessonProgress("L", [forLesson(0, 0.6, "2026-11-01T10:00:00.000Z"), forLesson(0, null, "2026-11-01T11:00:00.000Z")], null);
    expect(unscored.scores.get(0)).toBe(0.6);
  });

  it("has no score when nothing was scored", () => {
    expect(lessonScore(1, lessonProgress("L", [forLesson(0, null, "2026-11-01T10:00:00.000Z")], null))).toBeNull();
  });

  it("finds the first open step that asks for an activity", () => {
    const steps: LessonStep[] = [twister, { kind: "drill", drill: "minimal_pairs" }, twister];
    expect(openStepFor(steps, new Set(), { activityId: "drill:twister", variant: null })).toBe(0);
    expect(openStepFor(steps, new Set([0]), { activityId: "drill:twister", variant: null })).toBe(2);
    expect(openStepFor(steps, new Set([0, 2]), { activityId: "drill:twister", variant: null })).toBeNull();
    expect(openStepFor(steps, new Set(), { activityId: "drill:shadowing", variant: null })).toBeNull();
  });
});
