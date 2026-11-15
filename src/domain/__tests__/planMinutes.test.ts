import { buildDailyPlan, type PlanInput } from "../dailyPlan";
import { minutesOnDay, wantedByPlanStep, type ActivityEntry } from "../activityLog";
import { getActivity } from "../../content/activities";
import { drillFromText } from "../drills/drillSpecs";
import { MINUTE_CHOICES } from "../sessionLength";

const skills = Object.fromEntries(["articulation", "cadence", "impromptu", "confidence", "conversation"].map((k) => [k, { rating: 40, lastPracticedAt: null }])) as PlanInput["skills"];
const catalogue = (id: string) => getActivity(id)?.minutes ?? 1;
let n = 0;
const entry = (activityId: string, extra: Partial<ActivityEntry> = {}): ActivityEntry => ({
  id: `e${n++}`,
  activityId,
  kind: "drill",
  variant: null,
  outcome: "done",
  at: "2026-10-07T10:00:00.000Z",
  localDate: "2026-10-07",
  score: null,
  sessionId: null,
  planDate: null,
  planSlot: null,
  planStepId: null,
  lessonId: null,
  lessonStepIndex: null,
  ...extra,
});

describe("minutes from a plan", () => {
  it.each(MINUTE_CHOICES.map((m) => [m]))("a finished %i-minute plan counts its goal, whether done from the plan or from Practice", (minutes) => {
    for (const day of ["2026-10-07", "2026-10-08", "2026-10-09"]) {
      const plan = buildDailyPlan({ date: day, minutes, skills, recentFocus: [], lessons: {} });
      const fromPlan = plan.steps.map((st) => entry(wantedByPlanStep(st)!.activityId, { planDate: day, planStepId: st.id, localDate: day }));
      const free = plan.steps.map((st) => entry(wantedByPlanStep(st)!.activityId, { localDate: day, variant: wantedByPlanStep(st)!.variant }));
      expect(minutesOnDay({ ...plan, slot: 0 }, fromPlan, catalogue)).toBeCloseTo(minutes);
      expect(minutesOnDay({ ...plan, slot: 0 }, free, catalogue)).toBeCloseTo(minutes);
    }
  });

  it("counts nothing for a skip, and catalogue minutes for anything off the plan", () => {
    const plan = buildDailyPlan({ date: "2026-10-07", minutes: 10, skills, recentFocus: [], lessons: {} });
    const skip = entry("drill:twister", { outcome: "skipped", planDate: "2026-10-07", planStepId: plan.steps[0].id });
    expect(minutesOnDay({ ...plan, slot: 0 }, [skip], catalogue)).toBe(0);
    expect(minutesOnDay(null, [entry("reflect:three_things")], catalogue)).toBe(catalogue("reflect:three_things"));
  });
});

describe("the judge's drill, from its words", () => {
  it("reads an id or a title in the text, and nothing else", () => {
    expect(drillFromText("twister")).toBe("twister");
    expect(drillFromText("Try the Tongue twister drill, slowly.")).not.toBeNull();
    expect(drillFromText("Practise pausing at the end of each sentence.")).toBeNull();
    expect(drillFromText("")).toBeNull();
  });
});
