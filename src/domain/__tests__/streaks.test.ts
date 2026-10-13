import { computeStreakState, computeStreaks } from "../streaks";

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

// --- freezes ----------------------------------------------------------------

// `n` consecutive days starting 2026-09-01, as YYYY-MM-DD.
function run(n: number, from = new Date(2026, 8, 1)): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
}
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0);

describe("streak freezes", () => {
  it("earns a freeze on every 7th practice day", () => {
    const six = computeStreakState(run(6), day(2026, 9, 6));
    expect(six).toMatchObject({ freezesHeld: 0, practicedTowardNext: 6 });
    const seven = computeStreakState(run(7), day(2026, 9, 7));
    expect(seven).toMatchObject({ freezesHeld: 1, practicedTowardNext: 0, currentStreak: 7 });
  });

  it("holds at most two; the rest are lost", () => {
    expect(computeStreakState(run(21), day(2026, 9, 21)).freezesHeld).toBe(2);
    expect(computeStreakState(run(14), day(2026, 9, 14)).freezesHeld).toBe(2);
  });

  it("covers a missed day with a freeze without adding to the count", () => {
    // 7 days (Sep 1-7, one freeze), skip the 8th, practice the 9th.
    const dates = [...run(7), "2026-09-09"];
    const state = computeStreakState(dates, day(2026, 9, 9));
    expect(state.currentStreak).toBe(8);
    expect(state.frozenDates).toEqual(["2026-09-08"]);
    expect(state.freezesHeld).toBe(0);
    expect(state.longestStreak).toBe(8);
  });

  it("covers several missed days when it holds enough freezes", () => {
    // 14 days earns two; miss the 15th and 16th; back on the 17th.
    const state = computeStreakState([...run(14), "2026-09-17"], day(2026, 9, 17));
    expect(state.currentStreak).toBe(15);
    expect(state.frozenDates).toEqual(["2026-09-15", "2026-09-16"]);
    expect(state.freezesHeld).toBe(0);
  });

  it("breaks the streak, spending nothing, when the gap is longer than the freezes held", () => {
    // One freeze, then a 2-day gap.
    const state = computeStreakState([...run(7), "2026-09-10"], day(2026, 9, 10));
    expect(state.currentStreak).toBe(1);
    expect(state.frozenDates).toEqual([]);
    expect(state.freezesHeld).toBe(1);
    expect(state.longestStreak).toBe(7);
  });

  it("keeps counting toward the next freeze after a break", () => {
    const state = computeStreakState([...run(7), "2026-09-10"], day(2026, 9, 10));
    // 8 practice days so far: one freeze earned on the 7th, one toward the next.
    expect(state.practicedTowardNext).toBe(1);
  });

  it("leaves rest days out of what a freeze must cover", () => {
    const weekdays = [1, 2, 3, 4, 5];
    // Mon Sep 7 - Sun Sep 13 week of practice (rest days don't need it) plus
    // the following Monday: no freeze is needed over the weekend.
    const dates = ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-14"];
    const state = computeStreakState(dates, day(2026, 9, 14), weekdays);
    expect(state.currentStreak).toBe(6);
    expect(state.frozenDates).toEqual([]);
  });

  it("judges the open gap before today the same way", () => {
    // One freeze held; last practiced Sep 7; today is Sep 9, so Sep 8 is covered.
    const covered = computeStreakState(run(7), day(2026, 9, 9));
    expect(covered.currentStreak).toBe(7);
    expect(covered.frozenDates).toEqual(["2026-09-08"]);
    expect(covered.freezesHeld).toBe(0);
    // Two days missed with one freeze: gone.
    const broken = computeStreakState(run(7), day(2026, 9, 10));
    expect(broken.currentStreak).toBe(0);
    expect(broken.freezesHeld).toBe(1);
    expect(broken.frozenDates).toEqual([]);
  });

  it("has nothing to cover before there is any practice", () => {
    expect(computeStreakState([], day(2026, 9, 9))).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      freezesHeld: 0,
      frozenDates: [],
      practicedTowardNext: 0,
    });
  });

  it("counts practice on a rest day", () => {
    const weekdays = [1, 2, 3, 4, 5];
    // Practiced Saturday Sep 12 (a rest day) and Monday Sep 14.
    const state = computeStreakState(["2026-09-12", "2026-09-14"], day(2026, 9, 14), weekdays);
    expect(state.currentStreak).toBe(2);
  });

  it("agrees with computeStreaks on the plain numbers", () => {
    const dates = [...run(7), "2026-09-09"];
    const { currentStreak, longestStreak } = computeStreakState(dates, day(2026, 9, 9));
    expect(computeStreaks(dates, day(2026, 9, 9))).toEqual({ currentStreak, longestStreak });
  });
});
