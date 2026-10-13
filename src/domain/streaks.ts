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

// A freeze is earned for every 7 days you practice, and you can hold two.
export const FREEZE_EVERY = 7;
export const FREEZE_MAX = 2;

export interface StreakState extends StreakResult {
  // Freezes in hand, after any the current streak is already leaning on.
  freezesHeld: number;
  // The missed days a freeze covered (YYYY-MM-DD, oldest first), including a
  // gap still open before today — those only stay covered if you practice.
  frozenDates: string[];
  // Practice days since the last freeze was earned, 0 to FREEZE_EVERY - 1.
  practicedTowardNext: number;
}

// dates: any-order "YYYY-MM-DD" or ISO datetime strings, one per practiced
// day (duplicates on one day count once; datetimes are UTC and count on their
// LOCAL date). `practiceDays` (0 = Sunday … 6) are the days you plan to
// practice; any other day is a rest day that never breaks a streak (empty =
// every day).
//
// Freezes are worked out from the history alone, so nothing is stored. Walking
// forward day by day, every FREEZE_EVERY-th practice day earns one (up to
// FREEZE_MAX; extras are lost). A run of missed planned days is covered when
// you hold at least that many freezes: they're used up, the streak carries on,
// and the covered days don't add to its count. A longer gap breaks the streak
// and spends nothing. The gap before today is judged the same way, so a streak
// is "alive" if freezes could cover the days since your last practice.
export function computeStreakState(dates: string[], today: Date = new Date(), practiceDays: number[] = []): StreakState {
  const days = Array.from(new Set(dates.map((d) => (d.length > 10 ? isoDateFromDate(new Date(d)) : d.slice(0, 10)))))
    .sort()
    .map(dateFromISODate);

  if (days.length === 0) {
    return { currentStreak: 0, longestStreak: 0, freezesHeld: 0, frozenDates: [], practicedTowardNext: 0 };
  }

  const isRest = (d: Date) => practiceDays.length > 0 && !practiceDays.includes(d.getDay());
  // The planned days strictly between `from` and `to` that went unpracticed.
  const missedBetween = (from: Date, to: Date): Date[] => {
    const missed: Date[] = [];
    const gap = daysBetween(from, to);
    for (let i = 1; i < gap; i++) {
      const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
      if (!isRest(d)) missed.push(d);
    }
    return missed;
  };

  let held = 0;
  let toward = 0;
  let run = 0;
  let longest = 0;
  const frozen: Date[] = [];
  let previous: Date | null = null;
  for (const day of days) {
    if (previous) {
      const missed = missedBetween(previous, day);
      if (missed.length > 0 && missed.length <= held) {
        held -= missed.length;
        frozen.push(...missed);
      } else if (missed.length > held) {
        run = 0;
      }
    }
    run += 1;
    longest = Math.max(longest, run);
    toward += 1;
    if (toward === FREEZE_EVERY) {
      toward = 0;
      held = Math.min(FREEZE_MAX, held + 1);
    }
    previous = day;
  }

  const last = previous as Date;
  const open = missedBetween(last, dateFromISODate(isoDateFromDate(today)));
  let currentStreak = run;
  if (open.length > held) {
    currentStreak = 0;
  } else if (open.length > 0) {
    held -= open.length;
    frozen.push(...open);
  }

  return { currentStreak, longestStreak: longest, freezesHeld: held, frozenDates: frozen.map(isoDateFromDate), practicedTowardNext: toward };
}

// The current and longest streak — see computeStreakState for the rules.
export function computeStreaks(dates: string[], today: Date = new Date(), practiceDays: number[] = []): StreakResult {
  const { currentStreak, longestStreak } = computeStreakState(dates, today, practiceDays);
  return { currentStreak, longestStreak };
}

// How many different days you practiced since Monday (this week, local time).
// Takes the same date strings as computeStreakState.
export function practiceDaysThisWeek(dates: string[], today: Date = new Date()): number {
  const sinceMonday = (today.getDay() + 6) % 7;
  const monday = isoDateFromDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - sinceMonday));
  const days = new Set(dates.map((d) => (d.length > 10 ? isoDateFromDate(new Date(d)) : d.slice(0, 10))));
  return Array.from(days).filter((d) => d >= monday).length;
}
