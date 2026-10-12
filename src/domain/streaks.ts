import { dateFromISODate, daysBetween, isoDateFromDate } from "../utils/dateUtils";

export interface StreakResult {
  currentStreak: number;
  longestStreak: number;
}

// Fixed day counts worth celebrating, ascending — used both for the
// in-the-moment "you just hit N days" toast and for the persistent badge on
// Trends showing the best milestone ever reached.
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 150, 200, 365] as const;

// Returns the milestone `streak` days exactly equals, or null if it's not one
// — call right after a session completes, so the toast fires on the one day
// it's actually true rather than every day past the threshold.
export function streakMilestoneReached(streak: number): number | null {
  return STREAK_MILESTONES.find((m) => m === streak) ?? null;
}

// Returns the highest milestone `streak` has ever reached or passed, or null
// if none yet — for a persistent "best milestone" badge that doesn't
// disappear if the streak later breaks.
export function highestStreakMilestone(streak: number): number | null {
  return [...STREAK_MILESTONES].reverse().find((m) => streak >= m) ?? null;
}

// dates: any-order array of "YYYY-MM-DD" or ISO datetime strings, one per
// practiced day (duplicates on the same day are fine — a second same-day
// session doesn't count as a second streak day). Datetimes are UTC, so they
// count on their LOCAL date. `practiceDays` (0 = Sunday … 6) are the days you
// plan to practice; any other day is a rest day that never breaks a streak
// (empty = every day is a practice day).
export function computeStreaks(dates: string[], today: Date = new Date(), practiceDays: number[] = []): StreakResult {
  const uniqueSortedDays = Array.from(new Set(dates.map((d) => (d.length > 10 ? isoDateFromDate(new Date(d)) : d.slice(0, 10)))))
    .map(dateFromISODate)
    .sort((a, b) => a.getTime() - b.getTime());

  if (uniqueSortedDays.length === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  const isRest = (d: Date) => practiceDays.length > 0 && !practiceDays.includes(d.getDay());
  // True when every day strictly between `from` and `to` is a rest day.
  const onlyRestBetween = (from: Date, to: Date) => {
    const gap = daysBetween(from, to);
    for (let i = 1; i < gap; i++) {
      if (!isRest(new Date(from.getFullYear(), from.getMonth(), from.getDate() + i))) return false;
    }
    return true;
  };

  let longestStreak = 1;
  let run = 1;
  for (let i = 1; i < uniqueSortedDays.length; i++) {
    run = onlyRestBetween(uniqueSortedDays[i - 1], uniqueSortedDays[i]) ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
  }

  const todayAtMidnight = dateFromISODate(isoDateFromDate(today));
  const lastPracticedDay = uniqueSortedDays[uniqueSortedDays.length - 1];

  // Still "alive" if nothing but rest days sits between the last practiced
  // day and today — today itself hasn't passed yet.
  let currentStreak = 0;
  if (onlyRestBetween(lastPracticedDay, todayAtMidnight)) {
    currentStreak = 1;
    for (let i = uniqueSortedDays.length - 1; i > 0; i--) {
      if (onlyRestBetween(uniqueSortedDays[i - 1], uniqueSortedDays[i])) currentStreak += 1;
      else break;
    }
  }

  return { currentStreak, longestStreak };
}
