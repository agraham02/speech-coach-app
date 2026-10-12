import { buildTopUpPlan, defaultExtraHours, goalDays, reminderDates, sessionHours } from "../dailyGoal";
import { formatReminderHour, hoursInPeriod, switchPeriod } from "../reminderSettings";
import type { PlanInput } from "../dailyPlan";

const base: PlanInput = {
  date: "2026-10-12",
  minutes: 8,
  skills: {
    articulation: { rating: 40, lastPracticedAt: null },
    cadence: { rating: 40, lastPracticedAt: null },
    impromptu: { rating: 40, lastPracticedAt: null },
    confidence: { rating: 40, lastPracticedAt: null },
    conversation: { rating: 40, lastPracticedAt: null },
  },
  recentFocus: [],
  lessons: {},
};

describe("daily goal", () => {
  it("builds a short top-up on a skill not practiced today", () => {
    const plan = buildTopUpPlan({ ...base, slot: 1, doneSkills: ["cadence"] });
    expect(plan.focusSkill).not.toBe("cadence");
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps.reduce((m, s) => m + s.minutes, 0)).toBeLessThanOrEqual(5);
  });

  it("gives the second top-up yet another skill", () => {
    const first = buildTopUpPlan({ ...base, slot: 1, doneSkills: ["cadence"] });
    const second = buildTopUpPlan({ ...base, slot: 2, doneSkills: [first.focusSkill, "cadence"] });
    expect(["cadence", first.focusSkill]).not.toContain(second.focusSkill);
  });

  it("leaves out loud drills when practicing somewhere shared", () => {
    for (let day = 1; day <= 20; day++) {
      const date = `2026-10-${String(day).padStart(2, "0")}`;
      const plan = buildTopUpPlan({ ...base, date, slot: 1, doneSkills: ["impromptu"], quiet: true });
      for (const s of plan.steps) expect(["move_it", "projection"]).not.toContain((s.lessonStep as { drill: string }).drill);
    }
  });

  it("arms the remaining slots today and the first one tomorrow", () => {
    const now = new Date(2026, 9, 12, 10, 30);
    const dates = reminderDates([8, 14, 19], 1, now);
    expect(dates.map((d) => `${d.getDate()} ${d.getHours()}`)).toEqual(["12 14", "12 19", "13 8"]);
  });

  it("skips slots already done and days you don't practice", () => {
    const now = new Date(2026, 9, 12, 10, 30); // a Monday
    expect(reminderDates([8, 14], 2, now).map((d) => `${d.getDate()} ${d.getHours()}`)).toEqual(["13 8"]);
    // weekdays only, on a Friday evening: next is Monday
    const friday = new Date(2026, 9, 16, 20, 0);
    expect(reminderDates([8], 1, friday, [1, 2, 3, 4, 5]).map((d) => d.getDay())).toEqual([1]);
  });

  it("spaces default top-up hours through the day", () => {
    expect(defaultExtraHours(8, 2)).toEqual([17]);
    expect(defaultExtraHours(19, 3)).toEqual([9, 14]);
    expect(defaultExtraHours(19, 1)).toEqual([]);
  });

  it("counts goal days, leaving rest days out", () => {
    const today = new Date(2026, 9, 12); // Monday
    const counts = { "2026-10-12": 2, "2026-10-11": 1, "2026-10-10": 3 };
    expect(goalDays(counts, 2, today)).toEqual({ met: 2, of: 7 });
    expect(goalDays(counts, 2, today, 7, [1, 2, 3, 4, 5])).toEqual({ met: 1, of: 5 });
  });
});

describe("sessionHours", () => {
  it("keeps the user's picks and fills unset sessions with the spaced defaults", () => {
    expect(sessionHours(8, undefined, 3)).toEqual([8, ...defaultExtraHours(8, 3)]);
    expect(sessionHours(8, [12], 3)).toEqual([8, 12, defaultExtraHours(8, 3)[1]]);
    expect(sessionHours(8, [12, 15, 20], 2)).toEqual([8, 12]);
    expect(sessionHours(19, [9], 1)).toEqual([19]);
  });
});

describe("formatReminderHour", () => {
  it("reads as a whole hour", () => {
    expect(formatReminderHour(6)).toBe("6 AM");
    expect(formatReminderHour(12)).toBe("12 PM");
    expect(formatReminderHour(22)).toBe("10 PM");
  });
});

describe("AM/PM reminder hours", () => {
  it("offers 6-11 in the morning and noon-10 after", () => {
    expect(hoursInPeriod("AM")).toEqual([6, 7, 8, 9, 10, 11]);
    expect(hoursInPeriod("PM")).toEqual([12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
  });

  it("keeps the clock hour when switching, inside the reminder window", () => {
    expect(switchPeriod(8, "PM")).toBe(20);
    expect(switchPeriod(20, "AM")).toBe(8);
    expect(switchPeriod(11, "PM")).toBe(22);
    expect(switchPeriod(13, "AM")).toBe(6);
    expect(switchPeriod(12, "AM")).toBe(6);
    expect(switchPeriod(9, "AM")).toBe(9);
  });
});
