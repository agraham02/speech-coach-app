import {
  clockHour,
  defaultExtraHours,
  formatReminderHour,
  hoursInPeriod,
  periodHasValidHour,
  planSessionHours,
  reminderDates,
  reminderHours,
  sessionBounds,
  setSessionHour,
  switchPeriod,
} from "../reminderSettings";

// Reminders follow minutes a day: one per block, so one, or two on a 20 or 30
// minute day (domain/sessionLength.ts).

describe("block reminders", () => {
  it("arms the remaining blocks today and the first one tomorrow", () => {
    const now = new Date(2026, 9, 12, 10, 30);
    const dates = reminderDates([8, 18], 0, now);
    expect(dates.map((d) => `${d.getDate()} ${d.getHours()}`)).toEqual(["12 18", "13 8"]);
  });

  it("skips blocks already done and days you don't practice", () => {
    const now = new Date(2026, 9, 12, 10, 30); // a Monday
    expect(reminderDates([8, 14], 2, now).map((d) => `${d.getDate()} ${d.getHours()}`)).toEqual(["13 8"]);
    // weekdays only, on a Friday evening: next is Monday
    const friday = new Date(2026, 9, 16, 20, 0);
    expect(reminderDates([8], 1, friday, [1, 2, 3, 4, 5]).map((d) => d.getDay())).toEqual([1]);
  });

  it("puts the second block around 6 pm, and after the first", () => {
    expect(defaultExtraHours(8, 2)).toEqual([18]);
    expect(defaultExtraHours(19, 2)).toEqual([20]);
    expect(defaultExtraHours(23, 2)).toEqual([23]);
    expect(defaultExtraHours(19, 1)).toEqual([]);
  });

  it("keeps the user's pick for the second block and never more than two", () => {
    expect(planSessionHours(8, undefined, 2)).toEqual([8, 18]);
    expect(planSessionHours(8, [12], 2)).toEqual([8, 12]);
    expect(planSessionHours(8, [12, 15], 3)).toEqual([8, 12]);
    expect(planSessionHours(19, [9], 1)).toEqual([19]);
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
    expect(switchPeriod(19, "AM", { min: 9, max: 22 })).toBe(9);
    expect(switchPeriod(19, "AM", { min: 15, max: 23 })).toBe(19);
    expect(periodHasValidHour("AM", { min: 15, max: 23 })).toBe(false);
    expect(periodHasValidHour("PM", { min: 15, max: 23 })).toBe(true);
  });
});

describe("blocks in order", () => {
  it("forces stored hours into increasing order", () => {
    expect(planSessionHours(19, [9], 2)).toEqual([19, 20]);
    expect(planSessionHours(23, undefined, 2)).toEqual([22, 23]);
    expect(planSessionHours(8, [8], 2)).toEqual([8, 9]);
    expect(planSessionHours(23, undefined, 1)).toEqual([23]);
  });

  it("is applied to the hours the scheduler reads", () => {
    expect(reminderHours({ enabled: true, hour: 19, extraHours: [11] }, 2)).toEqual([19, 20]);
    expect(reminderHours({ enabled: true, hour: 19 }, 1)).toEqual([19]);
  });

  it("limits a block to after the one before and leaves room for the next", () => {
    expect(sessionBounds([8, 18], 0)).toEqual({ min: 0, max: 22 });
    expect(sessionBounds([8, 18], 1)).toEqual({ min: 9, max: 23 });
  });

  it("pushes the second block forward when the first moves past it", () => {
    expect(setSessionHour([8, 12], 0, 12)).toEqual([12, 13]);
    expect(setSessionHour([8, 12], 1, 7)).toEqual([8, 9]);
    expect(setSessionHour([8, 12], 1, 23)).toEqual([8, 23]);
  });

  it("arms reminders at hour 0 and late in the evening", () => {
    const now = new Date(2026, 9, 12, 20, 30);
    expect(reminderDates([22, 23], 0, now).map((d) => `${d.getDate()} ${d.getHours()}`)).toEqual(["12 22", "12 23", "13 22"]);
    const early = new Date(2026, 9, 12, 0, 10);
    expect(reminderDates([0, 1], 0, early).map((d) => `${d.getDate()} ${d.getHours()}`)).toEqual(["12 1", "13 0"]);
  });
});
