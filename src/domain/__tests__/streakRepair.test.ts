import { computeStreakState, REPAIR_MAX_MISSED, streakBreak } from "../streaks";
import { MORNING_REWIND_HOUR, rewindReminderHour } from "../rewind/reminder";
import { rewindReminderText } from "../notificationCopy";

// Wednesday 14 Oct 2026, evening.
const today = new Date(2026, 9, 14, 18, 0);
const days = (...list: string[]) => list;

describe("streak repair (task 4.6)", () => {
  it("offers a repair when one missed day broke a streak", () => {
    // Practised Sat to Mon, missed Tuesday, nothing yet today.
    const dates = days("2026-10-10", "2026-10-11", "2026-10-12");
    expect(computeStreakState(dates, today).currentStreak).toBe(0);
    expect(streakBreak(dates, today)).toEqual({ lost: 3, missed: ["2026-10-13"], lastPracticed: "2026-10-12" });
  });

  it("still offers it once you've practised today, and the repair joins the two runs", () => {
    const dates = days("2026-10-10", "2026-10-11", "2026-10-12", "2026-10-14");
    const found = streakBreak(dates, today)!;
    expect(found.missed).toEqual(["2026-10-13"]);
    expect(computeStreakState(dates, today).currentStreak).toBe(1);
    expect(computeStreakState(dates, today, [], found.missed).currentStreak).toBe(4);
    // Once repaired, there's nothing left to repair.
    expect(streakBreak(dates, today, [], found.missed)).toBeNull();
  });

  it(`covers up to ${REPAIR_MAX_MISSED} missed days, and no more`, () => {
    expect(streakBreak(days("2026-10-09", "2026-10-10", "2026-10-11"), today)?.missed).toEqual(["2026-10-12", "2026-10-13"]);
    expect(streakBreak(days("2026-10-08", "2026-10-09", "2026-10-10"), today)).toBeNull();
  });

  it("skips rest days when counting what was missed", () => {
    // Weekdays only: Friday practised, Monday and Tuesday missed.
    const weekdays = [1, 2, 3, 4, 5];
    const found = streakBreak(days("2026-10-08", "2026-10-09"), today, weekdays);
    expect(found?.missed).toEqual(["2026-10-12", "2026-10-13"]);
  });

  it("offers nothing for a one-day streak, an unbroken one, or one a freeze covered", () => {
    expect(streakBreak(days("2026-10-12"), today)).toBeNull();
    expect(streakBreak(days("2026-10-12", "2026-10-13"), today)).toBeNull();
    expect(streakBreak([], today)).toBeNull();
    // Seven days in a row earn a freeze, which covers the missed Tuesday.
    const week = ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12"];
    expect(computeStreakState(week, today).currentStreak).toBe(7);
    expect(streakBreak(week, today)).toBeNull();
  });
});

describe("Rewind's nudge follows your Rewind time", () => {
  it("nudges evening people at their evening hour", () => {
    expect(rewindReminderHour("evening", 21, 8)).toBe(21);
  });

  it("nudges morning people in the morning: their practice reminder's hour, else 8", () => {
    expect(rewindReminderHour("morning", 21, 7)).toBe(7);
    expect(rewindReminderHour("morning", 21, 19)).toBe(MORNING_REWIND_HOUR);
    expect(rewindReminderHour("morning", 21, null)).toBe(MORNING_REWIND_HOUR);
  });

  it("asks about yesterday in the morning", () => {
    const text = rewindReminderText("Sam", new Date(2026, 9, 14, 8, 0), "yesterday");
    expect(text.title).toBe("Morning, Sam");
    expect(text.body).toMatch(/yesterday/);
    expect(rewindReminderText("Sam", new Date(2026, 9, 14, 21, 0)).title).toBe("Evening, Sam");
  });
});

describe("review fixes (D44)", () => {
  it("never nudges in the evening before Rewind offers today", () => {
    expect(rewindReminderHour("evening", 15, null)).toBe(18);
    expect(rewindReminderHour("evening", 21, null)).toBe(21);
  });
});
