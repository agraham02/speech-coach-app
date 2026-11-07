import { ACTIVITIES, ACTIVITY_IDS, activityIdOfStep, activitySatisfies, drillActivityId, getActivity, variantOfStep } from "../activities";
import { GUIDED, LESSONS } from "../lessons";
import { WARM_UPS } from "../drillContent";
import { CONVERSATION_DRILLS, DRILL_TITLES, type DrillType } from "../../domain/drills/drillSpecs";

describe("the activity catalogue", () => {
  it("gives every activity its own id", () => {
    const ids = ACTIVITIES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has every drill type except the three that are covered by their own entries", () => {
    const covered = (Object.keys(DRILL_TITLES) as DrillType[]).filter((d) => d !== "guided" && d !== "warmup" && d !== "rep");
    for (const d of covered) expect(getActivity(drillActivityId(d))).toBeDefined();
  });

  it("has every guided exercise, warm-up and lesson", () => {
    for (const g of GUIDED) expect(getActivity(`guided:${g.id}`)?.title).toBe(g.title);
    for (const w of WARM_UPS) expect(getActivity(`warmup:${w.id}`)?.title).toBe(w.title);
    for (const l of LESSONS) expect(getActivity(`lesson:${l.id}`)?.kind).toBe("lesson");
    expect(GUIDED).toHaveLength(26);
    expect(LESSONS).toHaveLength(71);
  });

  it("finds an activity for every step of every lesson", () => {
    for (const lesson of LESSONS) {
      for (const step of lesson.steps) {
        expect({ lesson: lesson.id, id: activityIdOfStep(step), found: !!getActivity(activityIdOfStep(step)) }).toMatchObject({ found: true });
      }
    }
  });

  it("files conversation drills under conversation and the rest under drill", () => {
    for (const d of CONVERSATION_DRILLS) expect(getActivity(drillActivityId(d))?.kind).toBe("conversation");
    expect(getActivity(drillActivityId("conv_live"))?.kind).toBe("conversation");
    expect(getActivity(drillActivityId("twister"))?.kind).toBe("drill");
    expect(getActivity(drillActivityId("sum_up"))?.kind).toBe("drill");
  });

  it("has the speak, reflect, moment and check activities the plan lists", () => {
    expect(Object.values(ACTIVITY_IDS).every((id) => !!getActivity(id))).toBe(true);
    expect(getActivity(ACTIVITY_IDS.skillCheck)?.repeats).toBe("monthly");
    expect(getActivity(ACTIVITY_IDS.debrief)?.repeats).toBe("once-per-event");
    expect(getActivity(`lesson:${LESSONS[0].id}`)?.repeats).toBe("once-then-reviews");
  });

  it("has minutes and a place to appear for each", () => {
    for (const a of ACTIVITIES) {
      expect(a.minutes).toBeGreaterThan(0);
      expect(a.appears.length).toBeGreaterThan(0);
    }
  });
});

describe("matching a step to what was done", () => {
  it("needs the same activity", () => {
    expect(activitySatisfies({ activityId: "drill:twister", variant: null }, { activityId: "drill:twister", variant: null })).toBe(true);
    expect(activitySatisfies({ activityId: "drill:twister", variant: null }, { activityId: "drill:minimal_pairs", variant: null })).toBe(false);
  });

  it("lets a rep with no structure asked for be met by any rep, but a named structure only by that one", () => {
    const anyRep = { activityId: ACTIVITY_IDS.impromptu, variant: null };
    expect(activitySatisfies({ activityId: ACTIVITY_IDS.impromptu, variant: "PREP" }, anyRep)).toBe(true);
    expect(activitySatisfies({ activityId: ACTIVITY_IDS.impromptu, variant: "PREP" }, { ...anyRep, variant: "PREP" })).toBe(true);
    expect(activitySatisfies({ activityId: ACTIVITY_IDS.impromptu, variant: null }, { ...anyRep, variant: "PREP" })).toBe(false);
    expect(activitySatisfies({ activityId: ACTIVITY_IDS.impromptu, variant: "STAR" }, { ...anyRep, variant: "PREP" })).toBe(false);
  });

  it("reads a rep step's structure as its variant, and ignores 'None'", () => {
    expect(variantOfStep({ kind: "rep", framework: "PREP", focus: "x" })).toBe("PREP");
    expect(variantOfStep({ kind: "rep", framework: "None", focus: "x" })).toBeNull();
    expect(variantOfStep({ kind: "rep", focus: "x" })).toBeNull();
    expect(variantOfStep({ kind: "drill", drill: "twister" })).toBeNull();
  });
});
