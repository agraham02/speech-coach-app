import { buildDailyPlan, chooseFocusSkill, type PlanInput } from "../dailyPlan";
import { LESSONS, UNITS, getGuided } from "../../content/lessons";
import { DRILL_SKILL } from "../drills/drillSpecs";

function input(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    date: "2026-10-07",
    minutes: 8,
    skills: {
      articulation: { rating: 40, lastPracticedAt: "2026-09-30T10:00:00Z" },
      cadence: { rating: 40, lastPracticedAt: "2026-09-30T10:00:00Z" },
      impromptu: { rating: 40, lastPracticedAt: "2026-09-30T10:00:00Z" },
      confidence: { rating: 40, lastPracticedAt: "2026-09-30T10:00:00Z" },
      conversation: { rating: 40, lastPracticedAt: "2026-09-30T10:00:00Z" },
    },
    recentFocus: [],
    lessons: {},
    ...overrides,
  };
}

describe("daily plan", () => {
  it("is deterministic for the same day and inputs", () => {
    expect(buildDailyPlan(input())).toEqual(buildDailyPlan(input()));
  });

  it("focuses on the weakest skill", () => {
    const skills = { ...input().skills, cadence: { rating: 5, lastPracticedAt: "2026-09-30T10:00:00Z" } };
    expect(chooseFocusSkill(input({ skills }))).toBe("cadence");
  });

  it("doesn't pick the same focus three days in a row", () => {
    const skills = { ...input().skills, cadence: { rating: 5, lastPracticedAt: "2026-09-30T10:00:00Z" } };
    expect(chooseFocusSkill(input({ skills, recentFocus: ["cadence", "cadence"] }))).not.toBe("cadence");
  });

  it("covers every skill over a week of simulated use", () => {
    const seen = new Set<string>();
    const recent: PlanInput["recentFocus"] = [];
    const skills = input().skills;
    for (let day = 1; day <= 7; day++) {
      const date = `2026-10-${String(day).padStart(2, "0")}`;
      const plan = buildDailyPlan(input({ date, skills, recentFocus: [...recent] }));
      seen.add(plan.focusSkill);
      recent.unshift(plan.focusSkill);
      // practicing a skill marks it recent and nudges its rating up
      skills[plan.focusSkill] = { rating: skills[plan.focusSkill].rating + 5, lastPracticedAt: `${date}T10:00:00Z` };
    }
    expect(seen.size).toBe(5);
  });

  it("builds warm-up -> practice -> rep -> review for 8 minutes", () => {
    const skills = { ...input().skills, cadence: { rating: 5, lastPracticedAt: "2026-09-30T10:00:00Z" } };
    const plan = buildDailyPlan(input({ skills }));
    expect(plan.focusSkill).toBe("cadence");
    const kinds = plan.steps.map((s) => s.kind);
    expect(kinds[0]).toBe("warmup");
    expect(kinds).toContain("rep");
    expect(kinds[kinds.length - 1]).toBe("review");
  });

  it("ends a conversation day on a partner drill, with no video rep or review", () => {
    const skills = { ...input().skills, conversation: { rating: 5, lastPracticedAt: null } };
    const plan = buildDailyPlan(input({ skills }));
    expect(plan.focusSkill).toBe("conversation");
    const kinds = plan.steps.map((s) => s.kind);
    expect(kinds).not.toContain("rep");
    expect(kinds).not.toContain("review");
    const last = plan.steps[plan.steps.length - 1].lessonStep;
    expect(last?.kind === "drill" && DRILL_SKILL[last.drill]).toBe("conversation");
  });

  it("keeps the lesson's own drill in a 5-minute conversation plan", () => {
    const skills = { ...input().skills, conversation: { rating: 5, lastPracticedAt: null } };
    const plan = buildDailyPlan(input({ skills, minutes: 5 }));
    const lesson = LESSONS.find((l) => l.id === plan.lessonId)!;
    const lessonDrills = lesson.steps.filter((s) => s.kind === "drill").map((s) => (s.kind === "drill" ? s.drill : null));
    const planDrills = plan.steps.map((s) => (s.lessonStep?.kind === "drill" ? s.lessonStep.drill : null));
    for (const d of lessonDrills) expect(planDrills).toContain(d);
  });

  it("keeps the 5-minute plan short", () => {
    const plan = buildDailyPlan(input({ minutes: 5 }));
    expect(plan.steps.length).toBeLessThanOrEqual(3);
    expect(plan.steps.some((s) => s.kind === "review")).toBe(false);
  });

  it("moves to the next unfinished lesson, and to due reviews", () => {
    const first = buildDailyPlan(input());
    const skillLessons = LESSONS.filter((l) => l.skill === first.focusSkill);
    expect(first.lessonId).toBe(skillLessons[0].id);
    const done = buildDailyPlan(input({ lessons: { [skillLessons[0].id]: { done: true, nextReviewAt: "2026-10-20" } } }));
    if (done.focusSkill === first.focusSkill) expect(done.lessonId).toBe(skillLessons[1].id);
    const due = buildDailyPlan(input({ lessons: { [skillLessons[0].id]: { done: true, nextReviewAt: "2026-10-01" } } }));
    if (due.focusSkill === first.focusSkill) expect(due).toMatchObject({ lessonId: skillLessons[0].id, isReview: true });
  });
});

describe("curriculum content", () => {
  it("every lesson's drills train a real drill type and reference valid ids", () => {
    for (const lesson of LESSONS) {
      expect(lesson.steps.length).toBeGreaterThan(0);
      expect(lesson.teach.how).toHaveLength(3);
      for (const step of lesson.steps) {
        if (step.kind === "drill") expect(DRILL_SKILL[step.drill]).toBeDefined();
        if (step.kind === "guided") expect(getGuided(step.guidedId)).toBeDefined();
        if (step.kind === "drill" && lesson.skill === "conversation") expect(DRILL_SKILL[step.drill]).toBe("conversation");
      }
    }
  });

  it("conversation guided exercises feed the conversation skill, and every lesson's unit exists", () => {
    for (const lesson of LESSONS) {
      expect(UNITS.find((u) => u.id === lesson.unitId)?.skill).toBe(lesson.skill);
      for (const step of lesson.steps) {
        if (step.kind === "guided" && lesson.skill === "conversation") expect(getGuided(step.guidedId)?.skill).toBe("conversation");
      }
    }
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
  });

  it("has at least two units' worth of lessons per skill", () => {
    for (const skill of ["articulation", "cadence", "impromptu", "confidence", "conversation"]) {
      expect(LESSONS.filter((l) => l.skill === skill).length).toBeGreaterThanOrEqual(4);
    }
  });
});
