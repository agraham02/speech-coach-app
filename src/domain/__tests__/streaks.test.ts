import { computeStreaks } from "../streaks";

const today = new Date(2026, 9, 14, 18, 0); // Wednesday

describe("streaks", () => {
  it("counts consecutive days, and stays alive until today has passed", () => {
    expect(computeStreaks(["2026-10-12", "2026-10-13"], today)).toEqual({ currentStreak: 2, longestStreak: 2 });
    expect(computeStreaks(["2026-10-12", "2026-10-13", "2026-10-14"], today).currentStreak).toBe(3);
    expect(computeStreaks(["2026-10-11", "2026-10-12"], today).currentStreak).toBe(0);
  });

  it("counts multiple sessions on one day once", () => {
    expect(computeStreaks(["2026-10-13", "2026-10-13T08:00:00", "2026-10-14"], today).currentStreak).toBe(2);
  });

  it("never lets a rest day break the streak", () => {
    const weekdays = [1, 2, 3, 4, 5];
    // Fri, (Sat/Sun rest), Mon, Tue
    const dates = ["2026-10-09", "2026-10-12", "2026-10-13"];
    expect(computeStreaks(dates, today, weekdays)).toEqual({ currentStreak: 3, longestStreak: 3 });
    expect(computeStreaks(dates, today).currentStreak).toBe(2);
    // Practiced Friday; on Monday the streak is still alive over the weekend.
    expect(computeStreaks(["2026-10-09"], new Date(2026, 9, 12, 9, 0), weekdays).currentStreak).toBe(1);
  });
});
