import { buildTopUpPlan, defaultExtraHours, goalDays, reminderDates, sessionHours } from "../dailyGoal";
import { clockHour, formatReminderHour, hoursInPeriod, periodHasValidHour, planSessionHours, reminderHours, sessionBounds, setSessionHour, switchPeriod } from "../reminderSettings";
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
    expect(defaultExtraHours(19, 3)).toEqual([20, 21]);
    expect(defaultExtraHours(19, 2)).toEqual([21]);
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
  it("offers 1-12 in both periods, starting at 1 and ending at 12", () => {
    expect(hoursInPeriod("AM")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0]);
    expect(hoursInPeriod("PM")).toEqual([13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 12]);
    expect(hoursInPeriod("AM").map((h) => clockHour(h))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(hoursInPeriod("PM").map((h) => clockHour(h))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("reads midnight and noon as 12", () => {
    expect(formatReminderHour(0)).toBe("12 AM");
    expect(formatReminderHour(12)).toBe("12 PM");
    expect(formatReminderHour(23)).toBe("11 PM");
  });

  it("keeps the clock hour when switching", () => {
    expect(switchPeriod(8, "PM")).toBe(20);
    expect(switchPeriod(20, "AM")).toBe(8);
    expect(switchPeriod(11, "PM")).toBe(23);
    expect(switchPeriod(13, "AM")).toBe(1);
    expect(switchPeriod(12, "AM")).toBe(0);
    expect(switchPeriod(9, "AM")).toBe(9);
  });

  it("moves to the nearest allowed hour when the same one is too early", () => {
    // Session 2 can only be 9 AM or later: switching 7 PM to AM lands on 9 AM.
    expect(switchPeriod(19, "AM", { min: 9, max: 22 })).toBe(9);
    // No allowed AM hour at all: unchanged.
    expect(switchPeriod(19, "AM", { min: 15, max: 23 })).toBe(19);
    expect(periodHasValidHour("AM", { min: 15, max: 23 })).toBe(false);
    expect(periodHasValidHour("PM", { min: 15, max: 23 })).toBe(true);
  });
});

describe("sessions in order", () => {
  it("forces stored hours into increasing order", () => {
    expect(planSessionHours(19, [9, 14], 3)).toEqual([19, 20, 21]);
    expect(planSessionHours(23, undefined, 3)).toEqual([21, 22, 23]);
    expect(planSessionHours(8, [12, 15], 3)).toEqual([8, 12, 15]);
    expect(planSessionHours(8, [8], 2)).toEqual([8, 9]);
    expect(planSessionHours(23, undefined, 1)).toEqual([23]);
  });

  it("is applied to the hours the scheduler reads", () => {
    expect(reminderHours({ enabled: true, hour: 19, extraHours: [11] }, 2)).toEqual([19, 20]);
    expect(reminderHours({ enabled: true, hour: 19 }, 1)).toEqual([19]);
  });

  it("limits a session to after the one before and leaves room for later ones", () => {
    expect(sessionBounds([8, 12, 18], 0)).toEqual({ min: 0, max: 21 });
    expect(sessionBounds([8, 12, 18], 1)).toEqual({ min: 9, max: 22 });
    expect(sessionBounds([8, 12, 18], 2)).toEqual({ min: 13, max: 23 });
  });

  it("pushes later sessions forward when an earlier one moves past them", () => {
    expect(setSessionHour([8, 12, 18], 0, 12)).toEqual([12, 13, 18]);
    expect(setSessionHour([8, 12, 18], 0, 19)).toEqual([19, 20, 21]);
    expect(setSessionHour([8, 12], 1, 7)).toEqual([8, 9]);
    expect(setSessionHour([8, 12], 1, 23)).toEqual([8, 23]);
  });

  it("arms reminders at hour 0 and late in the evening", () => {
    const now = new Date(2026, 9, 12, 20, 30);
    expect(reminderDates([21, 22, 23], 0, now).map((d) => `${d.getDate()} ${d.getHours()}`)).toEqual(["12 21", "12 22", "12 23", "13 21"]);
    const early = new Date(2026, 9, 12, 0, 10);
    expect(reminderDates([0, 1], 0, early).map((d) => `${d.getDate()} ${d.getHours()}`)).toEqual(["12 1", "13 0"]);
  });
});
