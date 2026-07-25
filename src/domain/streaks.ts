import { dateFromISODate, daysBetween, isoDateFromDate } from "../utils/dateUtils";

export interface StreakResult {
  currentStreak: number;
  longestStreak: number;
}

// dates: any-order array of "YYYY-MM-DD" or ISO datetime strings, one per
// practiced day (duplicates on the same day are fine — a second same-day
// session doesn't count as a second streak day).
export function computeStreaks(dates: string[], today: Date = new Date()): StreakResult {
  const uniqueSortedDays = Array.from(new Set(dates.map((d) => d.slice(0, 10))))
    .map(dateFromISODate)
    .sort((a, b) => a.getTime() - b.getTime());

  if (uniqueSortedDays.length === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  let longestStreak = 1;
  let run = 1;
  for (let i = 1; i < uniqueSortedDays.length; i++) {
    const gap = daysBetween(uniqueSortedDays[i - 1], uniqueSortedDays[i]);
    run = gap === 1 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
  }

  const todayAtMidnight = dateFromISODate(isoDateFromDate(today));
  const lastPracticedDay = uniqueSortedDays[uniqueSortedDays.length - 1];
  const gapFromToday = daysBetween(lastPracticedDay, todayAtMidnight);

  // Streak is still "alive" if the most recent session was today or
  // yesterday — practicing yesterday shouldn't zero out the streak until
  // today has actually passed without a session.
  let currentStreak = 0;
  if (gapFromToday <= 1) {
    currentStreak = 1;
    for (let i = uniqueSortedDays.length - 1; i > 0; i--) {
      const gap = daysBetween(uniqueSortedDays[i - 1], uniqueSortedDays[i]);
      if (gap === 1) currentStreak += 1;
      else break;
    }
  }

  return { currentStreak, longestStreak };
}
