import { createTestDatabase, sqliteAvailable } from "./sqliteTestDb";

// The activity log and everything that reads it, against a real SQLite
// database with the real schema: check-offs syncing between the plan, a
// lesson and Practice (docs/overhaul/PLAN.md, section 5.2). Every value is
// made up.

let mockDb: ReturnType<typeof createTestDatabase>;
let mockCurrentLessons: string[] = [];
const mockLessonDone = jest.fn();

jest.mock("../../../utils/logger", () => ({ logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined } }));
jest.mock("../database", () => ({
  getDatabase: async () => mockDb,
  inTransaction: (db: { withTransactionAsync: (task: () => Promise<void>) => Promise<void> }, task: () => Promise<void>) => db.withTransactionAsync(task),
}));
jest.mock("../../prefs/prefsStore", () => ({
  getNextEvent: () => null,
  getReminderSettings: () => ({ practiceDays: [] }),
  getUserProfile: () => null,
  getCurriculumAutoLevel: () => null,
  getCurriculumOverride: () => null,
  setCurriculumAutoLevel: () => undefined,
  setCurriculumOverride: () => undefined,
}));
jest.mock("../../progress/progressEvents", () => ({ emitStageEarned: () => undefined }));
jest.mock("../../notifications/reminderScheduler", () => ({ syncDailyReminder: async () => undefined }));
jest.mock("../../path/pathService", () => ({
  getCurrentLessonIds: async () => mockCurrentLessons,
  onLessonCompleted: () => mockLessonDone(),
}));

import { ensureSchema } from "../schema";
import { getEntriesForLesson, getEntriesOn, getLessonStepsDone, logActivity } from "../activityLogRepo";
import { getLessonStates, getLessonStepsState, getTodaysPlan, getTopUpPlan, skipPlanStep } from "../progressRepo";
import { completePracticeStep, subscribePracticeSteps, type PracticeStepDone } from "../../practice/practiceEvents";
import { ACTIVITY_IDS, activityIdOfStep, variantOfStep } from "../../../content/activities";
import { LESSONS, type Lesson } from "../../../content/lessons";
import { todayISODate } from "../../../utils/dateUtils";

const describeIfSqlite = sqliteAvailable() ? describe : describe.skip;

// A lesson whose steps all ask for different activities, so each one is
// unambiguous.
const lesson: Lesson = LESSONS.find((l) => l.steps.length >= 3 && new Set(l.steps.map(activityIdOfStep)).size === l.steps.length)!;
const stepActivity = (i: number) => activityIdOfStep(lesson.steps[i]);

beforeEach(async () => {
  mockDb = createTestDatabase();
  await ensureSchema(mockDb as never);
  mockCurrentLessons = [];
  mockLessonDone.mockReset();
});

describeIfSqlite("the activity log", () => {
  it("has a lesson to test with", () => {
    expect(lesson).toBeDefined();
  });

  it("logs what was done, with the day it was done on", async () => {
    await completePracticeStep("drill:twister", undefined, 0.8);
    const today = await getEntriesOn(todayISODate());
    expect(today).toHaveLength(1);
    expect(today[0]).toMatchObject({ activityId: "drill:twister", kind: "drill", outcome: "done", score: 0.8, planStepId: null, lessonId: null });
  });

  it("logs from Practice with no plan or lesson behind it", async () => {
    await completePracticeStep(ACTIVITY_IDS.freeRecord, undefined, null, { sessionId: "s1" });
    expect((await getEntriesOn(todayISODate()))[0]).toMatchObject({ activityId: "speak:free", kind: "speak", sessionId: "s1" });
  });

  it("logs a take once, however many screens report it", async () => {
    await completePracticeStep(ACTIVITY_IDS.impromptu, undefined, null, { sessionId: "s1" });
    await completePracticeStep(ACTIVITY_IDS.impromptu, undefined, null, { sessionId: "s1" });
    expect(await getEntriesOn(todayISODate())).toHaveLength(1);
  });

  it("does not log the skill check's placement samples", async () => {
    await completePracticeStep("drill:twister", { placement: true }, 0.9);
    expect(await getEntriesOn(todayISODate())).toHaveLength(0);
  });

  it("tells the screens underneath, with the activity", async () => {
    const seen: PracticeStepDone[] = [];
    const off = subscribePracticeSteps((e) => seen.push(e));
    await completePracticeStep("drill:twister", { lessonId: "x" }, 0.5);
    off();
    expect(seen).toEqual([expect.objectContaining({ activityId: "drill:twister", score: 0.5, context: { lessonId: "x" } })]);
  });
});

describeIfSqlite("check-offs on the plan", () => {
  it("ticks a plan step when its activity is done from Practice", async () => {
    const stored = await getTodaysPlan(8);
    const step = stored.plan.steps.find((s) => s.lessonStep && s.kind !== "line")!;
    expect(stored.completedStepIds).toEqual([]);

    await completePracticeStep(activityIdOfStep(step.lessonStep!), undefined, 0.8);

    const after = await getTodaysPlan(8);
    expect(after.completedStepIds).toContain(step.id);
  });

  it("ticks a step done from the plan itself, and not the others", async () => {
    const { plan } = await getTodaysPlan(8);
    const step = plan.steps[0];
    await completePracticeStep(activityIdOfStep(step.lessonStep!), { planDate: plan.date, planStepId: step.id, lessonId: plan.lessonId, lessonStepIndex: step.lessonStepIndex }, 0.7, {
      variant: variantOfStep(step.lessonStep!),
    });
    const after = await getTodaysPlan(8);
    expect(after.completedStepIds).toEqual([step.id]);
  });

  it("finishes the plan when every step is done, from anywhere, and remembers when", async () => {
    const { plan } = await getTodaysPlan(8);
    for (const step of plan.steps) {
      const id = step.kind === "review" ? ACTIVITY_IDS.review : activityIdOfStep(step.lessonStep!);
      await completePracticeStep(id, undefined, 0.8, { variant: step.lessonStep ? variantOfStep(step.lessonStep) : null });
    }
    const after = await getTodaysPlan(8);
    expect(after.completedStepIds).toHaveLength(plan.steps.length);
    expect(after.completedAt).not.toBeNull();
    const row = await mockDb.getFirstAsync<{ completed_at: string | null }>("SELECT completed_at FROM daily_plans WHERE date = ?", [plan.date]);
    expect(row?.completed_at).not.toBeNull();
  });

  it("counts a skip for the plan and nothing else", async () => {
    const { plan } = await getTodaysPlan(8);
    const step = plan.steps.find((s) => s.lessonStepIndex != null)!;
    const after = await skipPlanStep(plan.date, 0, step.id);
    expect(after?.completedStepIds).toEqual([step.id]);
    expect(await getLessonStepsState(plan.lessonId)).toEqual(new Set());
    expect((await getEntriesOn(plan.date))[0]).toMatchObject({ outcome: "skipped", planStepId: step.id });
  });

  it("lets something already done today tick a plan made afterwards", async () => {
    // Make today's plan, forget it, do one of its steps from Practice, then make it again.
    const first = await getTodaysPlan(8);
    const step = first.plan.steps.find((s) => s.lessonStep && s.kind !== "line")!;
    await mockDb.runAsync("DELETE FROM daily_plans");
    await completePracticeStep(activityIdOfStep(step.lessonStep!), undefined, 0.8);
    const again = await getTodaysPlan(8);
    expect(again.plan.steps.map((x) => x.id)).toEqual(first.plan.steps.map((x) => x.id));
    expect(again.completedStepIds).toContain(step.id);
  });

  it("keeps a top-up's rep out of the daily plan", async () => {
    const main = await getTodaysPlan(8);
    const topUp = await getTopUpPlan(1);
    const step = topUp.plan.steps[0];
    await completePracticeStep(activityIdOfStep(step.lessonStep!), { planDate: topUp.plan.date, planSlot: 1, planStepId: step.id }, 0.9);
    expect((await getTopUpPlan(1)).completedStepIds).toContain(step.id);
    const mainSteps = main.plan.steps.filter((s) => s.lessonStep && activityIdOfStep(s.lessonStep) === activityIdOfStep(step.lessonStep!));
    const mainAfter = await getTodaysPlan(8);
    for (const s of mainSteps) expect(mainAfter.completedStepIds).not.toContain(s.id);
  });
});

describeIfSqlite("check-offs on a lesson", () => {
  it("keeps a step ticked across days", async () => {
    await logActivity({ activityId: stepActivity(0), lessonId: lesson.id, lessonStepIndex: 0, score: 0.9, at: "2026-10-01T10:00:00.000Z" });
    expect(await getLessonStepsState(lesson.id)).toEqual(new Set([0]));
  });

  it("ticks a lesson step from a plan, using the position the plan step carries", async () => {
    await completePracticeStep(stepActivity(1), { planDate: todayISODate(), planStepId: "7", lessonId: lesson.id, lessonStepIndex: 1 }, 0.8);
    expect(await getLessonStepsState(lesson.id)).toEqual(new Set([1]));
  });

  it("ticks a step done from Practice when the lesson is current", async () => {
    mockCurrentLessons = [lesson.id];
    await completePracticeStep(stepActivity(2), undefined, 0.8);
    expect(await getLessonStepsState(lesson.id)).toEqual(new Set([2]));
    expect((await getEntriesForLesson(lesson.id))[0]).toMatchObject({ lessonStepIndex: 2 });
  });

  it("does not tick a lesson from Practice when it is not current", async () => {
    mockCurrentLessons = [];
    await completePracticeStep(stepActivity(2), undefined, 0.8);
    expect(await getLessonStepsState(lesson.id)).toEqual(new Set());
  });

  it("does not tick a lesson step from a plan step that did not come from the lesson", async () => {
    mockCurrentLessons = [lesson.id];
    await completePracticeStep(stepActivity(0), { planDate: todayISODate(), planStepId: "1", lessonId: lesson.id }, 0.8);
    expect(await getLessonStepsState(lesson.id)).toEqual(new Set());
  });

  it("completes the lesson when its last step is done, with the real average score", async () => {
    const scores = lesson.steps.map((_, i) => (i === 0 ? 0.9 : i === 1 ? 0.5 : 0.7));
    const seen: PracticeStepDone[] = [];
    const off = subscribePracticeSteps((e) => seen.push(e));
    for (let i = 0; i < lesson.steps.length; i++) {
      // Done from different places on different days is fine; here, the lesson and Practice.
      mockCurrentLessons = i % 2 === 0 ? [] : [lesson.id];
      const context = i % 2 === 0 ? { lessonId: lesson.id, lessonStepIndex: i } : undefined;
      await completePracticeStep(stepActivity(i), context, scores[i]);
      if (i < lesson.steps.length - 1) expect((await getLessonStates())[lesson.id]?.done ?? false).toBe(false);
    }
    off();
    const state = (await getLessonStates())[lesson.id];
    expect(state.done).toBe(true);
    expect(state.attempts).toBe(1);
    const expected = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(state.lastScore).toBeCloseTo(expected);
    expect(state.lastScore).not.toBe(0.8);
    expect(seen[seen.length - 1].lessonCompleted).toBe(lesson.id);
    expect(seen.slice(0, -1).every((e) => e.lessonCompleted === undefined)).toBe(true);
    expect(mockLessonDone).toHaveBeenCalledTimes(1);
  });

  it("completes a lesson whose steps were never scored, as passed", async () => {
    for (let i = 0; i < lesson.steps.length; i++) await completePracticeStep(stepActivity(i), { lessonId: lesson.id, lessonStepIndex: i }, null);
    const state = (await getLessonStates())[lesson.id];
    expect(state.done).toBe(true);
    expect(state.lastScore).toBeNull();
    expect(state.reviewIntervalDays).toBeGreaterThan(0);
  });

  it("fails the review interval when the average is under 70%", async () => {
    for (let i = 0; i < lesson.steps.length; i++) await completePracticeStep(stepActivity(i), { lessonId: lesson.id, lessonStepIndex: i }, 0.4);
    const state = (await getLessonStates())[lesson.id];
    expect(state.done).toBe(true);
    expect(state.lastScore).toBeCloseTo(0.4);
  });

  it("starts the steps over after it is completed, for a review, and completes again", async () => {
    for (let i = 0; i < lesson.steps.length; i++) await completePracticeStep(stepActivity(i), { lessonId: lesson.id, lessonStepIndex: i }, 0.8);
    expect((await getLessonStates())[lesson.id].attempts).toBe(1);
    expect((await getLessonStepsState(lesson.id)).size).toBe(0);

    // completed_at is stamped a moment after the last entry; a review is later.
    await new Promise((r) => setTimeout(r, 5));
    for (let i = 0; i < lesson.steps.length; i++) await completePracticeStep(stepActivity(i), { lessonId: lesson.id, lessonStepIndex: i }, 0.6);
    const state = (await getLessonStates())[lesson.id];
    expect(state.attempts).toBe(2);
    expect(state.lastScore).toBeCloseTo(0.6);
  });

  it("lists the steps done so far in each unfinished lesson, for the plan", async () => {
    await completePracticeStep(stepActivity(0), { lessonId: lesson.id, lessonStepIndex: 0 }, 0.8);
    await completePracticeStep(stepActivity(2), { lessonId: lesson.id, lessonStepIndex: 2 }, 0.8);
    expect((await getLessonStepsDone())[lesson.id].sort()).toEqual([0, 2]);
  });
});
