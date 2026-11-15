import { buildDailyPlan, chooseFocusSkill, drillsForWeakestLeaf, previewPlans, weakestLeaves, type PlanInput } from "../dailyPlan";
import { MINUTE_CHOICES } from "../sessionLength";
import { ACTIVITY_IDS, drillActivityId } from "../../content/activities";
import { getGridRow } from "../../content/skillGrid";
import { LESSONS, UNITS, getGuided } from "../../content/lessons";
import { DRILL_SKILL } from "../drills/drillSpecs";
import { MINIMAL_PAIRS } from "../../content/drillContent";
import { TONGUE_TWISTERS } from "../../data/tongueTwisters";

function input(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    date: "2026-10-07",
    minutes: 10,
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

describe("daily plan and the lesson's own steps", () => {
  const lesson = LESSONS.find((l) => l.skill === "articulation" && l.steps.filter((x) => x.kind !== "rep" && x.kind !== "warmup").length >= 2)!;
  const practiceIndexes = lesson.steps.map((st, i) => (st.kind !== "rep" && st.kind !== "warmup" ? i : -1)).filter((i) => i >= 0);
  const forLesson = (extra: Partial<PlanInput> = {}) =>
    buildDailyPlan(input({ minutes: 5, path: [lesson.unitId], lessons: Object.fromEntries(LESSONS.filter((l) => l.unitId === lesson.unitId && l.id !== lesson.id).map((l) => [l.id, { done: true, nextReviewAt: null }])), ...extra }));

  it("says where each step from the lesson sits in the lesson", () => {
    const plan = forLesson();
    expect(plan.lessonId).toBe(lesson.id);
    for (const step of plan.steps) {
      if (step.lessonStepIndex != null) expect(lesson.steps[step.lessonStepIndex]).toBe(step.lessonStep);
    }
    expect(plan.steps.some((st) => st.lessonStepIndex != null)).toBe(true);
  });

  it("gives no lesson position to a reflect step", () => {
    const plan = buildDailyPlan(input({ minutes: 15 }));
    for (const step of plan.steps.filter((st) => st.kind === "reflect" || st.kind === "moment")) expect(step.lessonStepIndex).toBeUndefined();
  });

  it("brings the lesson's practice steps not yet done ahead of the ones done", () => {
    const first = practiceIndexes[0];
    const fresh = forLesson().steps.find((st) => st.lessonStepIndex != null && practiceIndexes.includes(st.lessonStepIndex));
    expect(fresh?.lessonStepIndex).toBe(first);
    const next = forLesson({ lessonStepsDone: { [lesson.id]: [first] } }).steps.find((st) => st.lessonStepIndex != null && practiceIndexes.includes(st.lessonStepIndex));
    expect(next?.lessonStepIndex).toBe(practiceIndexes[1]);
  });

  it("goes through every practice step over the days a 5-minute plan takes", () => {
    const done: number[] = [];
    for (let day = 0; day < practiceIndexes.length; day++) {
      const step = forLesson({ lessonStepsDone: { [lesson.id]: [...done] } }).steps.find((st) => st.lessonStepIndex != null && practiceIndexes.includes(st.lessonStepIndex))!;
      done.push(step.lessonStepIndex!);
    }
    expect([...done].sort()).toEqual([...practiceIndexes].sort());
  });
});

describe("every lesson can be finished from Today alone", () => {
  // Someone who only ever does the plan: each day they do every step that came
  // from the lesson. The lesson must complete, whatever the plan length.
  const cases = LESSONS.flatMap((lesson) => MINUTE_CHOICES.map((minutes) => [lesson.id, minutes] as const));

  it.each(cases)("%s on a %i-minute plan", (lessonId, minutes) => {
    const lesson = LESSONS.find((l) => l.id === lessonId)!;
    const earlier = Object.fromEntries(
      LESSONS.filter((l) => l.unitId === lesson.unitId && LESSONS.indexOf(l) < LESSONS.indexOf(lesson)).map((l) => [l.id, { done: true, nextReviewAt: null }]),
    );
    const done = new Set<number>();
    for (let day = 0; day < 12 && done.size < lesson.steps.length; day++) {
      const plan = buildDailyPlan(input({ minutes, path: [lesson.unitId], lessons: earlier, lessonStepsDone: { [lesson.id]: [...done] } }));
      expect(plan.lessonId).toBe(lesson.id);
      for (const step of plan.steps) if (step.lessonStepIndex != null) done.add(step.lessonStepIndex);
    }
    expect([...done].sort((a, b) => a - b)).toEqual(lesson.steps.map((_, i) => i));
  });
});

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

  it("builds the five slots for 10 minutes: warm up, learn, drill, record + review, reflect", () => {
    const skills = { ...input().skills, cadence: { rating: 5, lastPracticedAt: "2026-09-30T10:00:00Z" } };
    const plan = buildDailyPlan(input({ skills }));
    expect(plan.focusSkill).toBe("cadence");
    expect([...new Set(plan.steps.map((s) => s.slot))]).toEqual(["warmup", "learn", "drill", "record", "reflect"]);
    expect(plan.steps[0].kind).toBe("warmup");
    expect(plan.steps.find((s) => s.slot === "record")?.kind).toBe("rep");
    expect(plan.steps.at(-1)?.kind).toBe("reflect");
    expect(plan.steps.some((s) => (s.kind as string) === "review")).toBe(false);
  });

  it("makes a conversation day's record slot a partner drill, with no video take", () => {
    const skills = { ...input().skills, conversation: { rating: 5, lastPracticedAt: null } };
    const plan = buildDailyPlan(input({ skills }));
    expect(plan.focusSkill).toBe("conversation");
    expect(plan.steps.map((s) => s.kind)).not.toContain("rep");
    const record = plan.steps.find((s) => s.slot === "record")?.lessonStep;
    expect(record?.kind === "drill" && DRILL_SKILL[record.drill]).toBe("conversation");
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
    for (const minutes of [5, 10] as const) {
      const plan = buildDailyPlan(input({ skills, lessons, minutes }));
      expect(plan.lessonId).toBe("con_2_breath");
      const kinds = plan.steps.map((s) => s.lessonStep?.kind === "drill" ? s.lessonStep.drill : s.kind);
      expect(kinds[0]).toBe("warmup");
      expect(kinds).toContain("breath_count");
      expect(kinds.filter((k) => k === "warmup")).toHaveLength(1);
    }
  });

  it("keeps the 5-minute plan to warm up, learn, and record + review", () => {
    const plan = buildDailyPlan(input({ minutes: 5 }));
    expect(plan.steps.map((s) => s.slot)).toEqual(["warmup", "learn", "record"]);
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

});

describe("minutes a day", () => {
  const skills = ["articulation", "cadence", "impromptu", "confidence", "conversation"] as const;
  const total = (plan: ReturnType<typeof buildDailyPlan>) => plan.steps.reduce((sum, st) => sum + st.minutes, 0);

  it("fills every goal's budget exactly, for every skill's lessons", () => {
    let checked = 0;
    for (const skill of skills) {
      const track = LESSONS.filter((l) => l.skill === skill);
      for (let k = 0; k < track.length; k++) {
        const lessons: PlanInput["lessons"] = {};
        track.slice(0, k).forEach((l) => (lessons[l.id] = { done: true, nextReviewAt: "2027-01-01" }));
        const rated = Object.fromEntries(skills.map((x) => [x, { rating: x === skill ? 1 : 90, lastPracticedAt: "2026-10-01T00:00:00Z" }])) as PlanInput["skills"];
        for (const minutes of MINUTE_CHOICES) {
          const plan = buildDailyPlan(input({ minutes, skills: rated, lessons }));
          expect([plan.lessonId, minutes, total(plan)]).toEqual([plan.lessonId, minutes, minutes]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("splits 20 and 30 into two blocks; the second is drill, conversation, review, reflect", () => {
    for (const minutes of [20, 30] as const) {
      const plan = buildDailyPlan(input({ minutes }));
      expect(plan.blocks.map((b) => b.minutes)).toEqual(minutes === 20 ? [10, 10] : [15, 15]);
      const second = plan.steps.filter((st) => st.block === 1);
      expect(second.map((st) => st.slot)).toEqual(["drill", "extra", "review", "reflect"]);
      const extra = second[1].lessonStep;
      expect(extra?.kind === "drill" && DRILL_SKILL[extra.drill]).toBe("conversation");
      // Two reflect steps, never the same one twice.
      const reflects = plan.steps.filter((st) => st.slot === "reflect").map((st) => st.activityId);
      expect(new Set(reflects).size).toBe(2);
    }
    expect(buildDailyPlan(input({ minutes: 15 })).blocks).toHaveLength(1);
  });

  it("gives a second block's review to a lesson that's due, and says which", () => {
    const due = LESSONS.find((l) => l.skill === "articulation" && l.steps.some((st) => st.kind === "drill" || st.kind === "guided"))!;
    const plan = buildDailyPlan(input({ minutes: 20, lessons: { [due.id]: { done: true, nextReviewAt: "2026-10-01" } } }));
    const review = plan.steps.find((st) => st.slot === "review")!;
    if (plan.lessonId !== due.id) {
      expect(review.lessonId).toBe(due.id);
      expect(due.steps[review.lessonStepIndex!]).toEqual(review.lessonStep);
    }
  });
});

describe("the drill slot", () => {
  it("aims at the lowest counted leaf on the focus", () => {
    const weak = drillsForWeakestLeaf("articulation", {});
    expect(weak).not.toBeNull();
    const low = drillsForWeakestLeaf("articulation", { [weak!.leaf]: 90 });
    // Raising that leaf moves the aim to another one.
    expect(low?.leaf).not.toBe(weak!.leaf);
    for (const d of low!.drills) expect(getGridRow(drillActivityId(d))?.moves.some((m) => m.leaf === low!.leaf)).toBe(true);
  });

  it("puts in a drill for the lowest leaf whose drills aren't already in the plan", () => {
    for (const skill of ["articulation", "cadence", "impromptu", "confidence"] as const) {
      const skills = { ...input().skills, [skill]: { rating: 5, lastPracticedAt: "2026-09-30T10:00:00Z" } };
      const plan = buildDailyPlan(input({ skills }));
      const drill = plan.steps.find((st) => st.slot === "drill")!;
      if (drill.lessonStepIndex != null || !drill.detail.startsWith("For ")) continue;
      const others = new Set(plan.steps.filter((st) => st !== drill).flatMap((st) => (st.lessonStep?.kind === "drill" ? [st.lessonStep.drill] : [])));
      const ranked = weakestLeaves(skill, {});
      const at = ranked.findIndex((l) => l.drills.some((d) => !others.has(d)));
      expect(drill.lessonStep?.kind === "drill" && ranked[at].drills.includes(drill.lessonStep.drill)).toBe(true);
    }
  });

  it("uses your last result's one thing next when it names a drill", () => {
    const skills = { ...input().skills, cadence: { rating: 5, lastPracticedAt: "2026-09-30T10:00:00Z" } };
    const plan = buildDailyPlan(input({ skills, nextDrill: "twister" }));
    const drill = plan.steps.find((st) => st.slot === "drill")!;
    if (drill.lessonStepIndex == null) expect(drill).toMatchObject({ lessonStep: { kind: "drill", drill: "twister" }, detail: "Your one thing to try next" });
  });
});

describe("the reflect slot", () => {
  const reflect = (ctx: PlanInput["reflect"]) => buildDailyPlan(input({ reflect: ctx })).steps.find((st) => st.slot === "reflect")!;

  it("takes the first that applies: debrief, rehearsal, Feeling of the week, Rewind, then Three things", () => {
    const all = {
      debrief: { eventId: "e1", title: "your interview" },
      eventSoon: { eventId: "e2", title: "your talk", daysAway: 1 },
      feelingDue: true,
      rewind: { day: "yesterday" as const, date: "2026-10-06" },
    };
    expect(reflect(all)).toMatchObject({ kind: "moment", activityId: ACTIVITY_IDS.eventAfter, eventId: "e1" });
    expect(reflect({ ...all, debrief: null })).toMatchObject({ kind: "rep", eventId: "e2", detail: "For your talk, tomorrow" });
    expect(reflect({ ...all, debrief: null, eventSoon: null })).toMatchObject({ activityId: ACTIVITY_IDS.feeling });
    expect(reflect({ rewind: { day: "yesterday", date: "2026-10-06" } })).toMatchObject({ activityId: ACTIVITY_IDS.rewind, title: "Rewind yesterday" });
    expect(reflect({ rewind: { day: "today", date: "2026-10-07" } })).toMatchObject({ title: "Rewind today" });
    expect(reflect({})).toMatchObject({ activityId: ACTIVITY_IDS.threeThings });
    expect(reflect(undefined)).toMatchObject({ activityId: ACTIVITY_IDS.threeThings });
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
