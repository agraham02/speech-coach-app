import { buildDailyPlan, chooseFocusSkill, previewPlans, type PlanInput } from "../dailyPlan";
import { LESSONS, UNITS, getGuided } from "../../content/lessons";
import { DRILL_SKILL } from "../drills/drillSpecs";
import { MINIMAL_PAIRS } from "../../content/drillContent";
import { TONGUE_TWISTERS } from "../../data/tongueTwisters";

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

  it("doesn't let a lesson's own warm-up crowd out its drill in a short plan", () => {
    // Confidence's breath unit opens with "Breathe low" (warm-up + drill).
    const skills = { ...input().skills, confidence: { rating: 5, lastPracticedAt: null } };
    const lessons = { con_b5_calm: { done: true, nextReviewAt: "2026-10-30" }, con_1_excited: { done: true, nextReviewAt: "2026-10-30" } };
    for (const minutes of [5, 8] as const) {
      const plan = buildDailyPlan(input({ skills, lessons, minutes }));
      expect(plan.lessonId).toBe("con_2_breath");
      const kinds = plan.steps.map((s) => s.lessonStep?.kind === "drill" ? s.lessonStep.drill : s.kind);
      expect(kinds[0]).toBe("warmup");
      expect(kinds).toContain("breath_count");
      expect(kinds.filter((k) => k === "warmup")).toHaveLength(1);
    }
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

  it("lists each skill's lessons in unit order, so Next up follows the path Learn shows", () => {
    for (const skill of ["articulation", "cadence", "impromptu", "confidence", "conversation"]) {
      const unitOrder = UNITS.filter((u) => u.skill === skill).map((u) => u.id);
      const lessonUnits = LESSONS.filter((l) => l.skill === skill).map((l) => unitOrder.indexOf(l.unitId));
      expect(lessonUnits).toEqual([...lessonUnits].sort((a, b) => a - b));
    }
  });

  it("feeds each guided self-rating to the skill of the lesson that uses it", () => {
    for (const lesson of LESSONS) {
      for (const step of lesson.steps) {
        if (step.kind === "guided") expect([step.guidedId, getGuided(step.guidedId)?.skill ?? "confidence"]).toEqual([step.guidedId, lesson.skill]);
      }
    }
  });

  it("points every lesson drill at content that exists", () => {
    for (const lesson of LESSONS) {
      for (const step of lesson.steps) {
        if (step.kind !== "drill" || !step.contentId) continue;
        if (step.drill === "minimal_pairs") expect(MINIMAL_PAIRS.map((m) => m.id)).toContain(step.contentId);
        if (step.drill === "twister") expect(TONGUE_TWISTERS.map((t) => t.id)).toContain(step.contentId);
      }
    }
  });

  it("runs the surprise-question rep with no prep time", () => {
    const rep = LESSONS.find((l) => l.id === "imp_10_surprise")!.steps.find((s) => s.kind === "rep");
    expect(rep).toMatchObject({ kind: "rep", prepSeconds: 0 });
  });

  it("has at least two units' worth of lessons per skill", () => {
    for (const skill of ["articulation", "cadence", "impromptu", "confidence", "conversation"]) {
      expect(LESSONS.filter((l) => l.skill === skill).length).toBeGreaterThanOrEqual(4);
    }
  });

  it("puts a line of the day in every plan, without growing the 5-minute one", () => {
    for (const minutes of [5, 8, 12] as const) {
      for (let day = 1; day <= 10; day++) {
        const plan = buildDailyPlan(input({ minutes, date: `2026-10-${String(day).padStart(2, "0")}` }));
        const kinds = plan.steps.map((s) => s.kind);
        if (minutes === 5) expect(kinds.filter((k) => k === "warmup" || k === "line").length).toBeLessThanOrEqual(1);
        else expect(kinds).toContain("line");
      }
    }
    const plan = buildDailyPlan(input({ minutes: 8 }));
    const line = plan.steps.find((s) => s.kind === "line")!;
    expect(line.lessonStep).toMatchObject({ kind: "drill", drill: "marked_reading" });
  });
});

describe("previewPlans", () => {
  it("previews a week that rotates through the skills", () => {
    const week = previewPlans(input({ date: "2026-10-12" }), 7);
    expect(week).toHaveLength(7);
    expect(week[6].date).toBe("2026-10-18");
    expect(new Set(week.map((p) => p.focusSkill)).size).toBeGreaterThanOrEqual(4);
    // a skill coming back moves on to its next lesson
    expect(new Set(week.map((p) => p.lessonId)).size).toBe(7);
  });

  it("leans toward boosted skills early", () => {
    const week = previewPlans(input({ date: "2026-10-12", priority: { conversation: 0.3 } }), 2);
    expect(week[0].focusSkill).toBe("conversation");
  });
});

describe("daily plan on a path", () => {
  const path = ["cad_pause", "imp_start", "con_nerves", "art_wake"];

  it("takes the next lesson of an active unit", () => {
    const plan = buildDailyPlan(input({ path }));
    expect(plan.unitId).toBe("cad_pause");
    expect(plan.lessonId).toBe(LESSONS.find((l) => l.unitId === "cad_pause")!.id);
    expect(plan.isReview).toBe(false);
  });

  it("alternates between the two active units", () => {
    expect(buildDailyPlan(input({ path, recentFocus: ["cadence"] })).unitId).toBe("imp_start");
    expect(buildDailyPlan(input({ path, recentFocus: ["impromptu"] })).unitId).toBe("cad_pause");
  });

  it("moves on once a unit's lessons are done", () => {
    const lessons = Object.fromEntries(LESSONS.filter((l) => l.unitId === "cad_pause").map((l) => [l.id, { done: true, nextReviewAt: null }]));
    const plan = buildDailyPlan(input({ path, lessons, recentFocus: ["impromptu"] }));
    expect(plan.unitId).toBe("con_nerves");
  });

  it("gives the day to reviews when they pile up", () => {
    const due = Object.fromEntries(LESSONS.slice(0, 3).map((l) => [l.id, { done: true, nextReviewAt: "2026-10-01T00:00:00Z" }]));
    const plan = buildDailyPlan(input({ path, lessons: due }));
    expect(plan.unitId).toBeUndefined();
    expect(plan.isReview).toBe(true);
  });

  it("falls back to need once the path is finished", () => {
    expect(buildDailyPlan(input({ path: [] })).unitId).toBeUndefined();
  });

  it("previews a week that follows the path", () => {
    const week = previewPlans(input({ path }), 4);
    expect(week.map((p) => p.unitId)).toEqual(["cad_pause", "imp_start", "cad_pause", "imp_start"]);
  });
});
