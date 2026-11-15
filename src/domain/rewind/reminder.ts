import { REWIND_EVENING_FROM_HOUR } from "./rewindTiming";

// When to nudge you to tell your day. Pure.

// How many evenings ahead are armed, so a few days away from the app still
// get their nudge.
export const REMINDER_DAYS_AHEAD = 7;

// A morning person's nudge, to tell yesterday: their practice reminder's hour
// when it's in the morning, else this.
export const MORNING_REWIND_HOUR = 8;

// An evening nudge comes no earlier than Rewind starts offering today.
export function rewindReminderHour(window: "morning" | "evening", eveningHour: number, practiceHour: number | null): number {
  if (window === "evening") return Math.max(eveningHour, REWIND_EVENING_FROM_HOUR);
  return practiceHour != null && practiceHour >= 4 && practiceHour < 12 ? practiceHour : MORNING_REWIND_HOUR;
}

export interface RewindReminderTimes {
  hour: number;
  now: Date;
  toldToday: boolean;
}

// The days to nudge: today's (if the hour hasn't passed and today's Rewind
// isn't told yet) and the ones after. `toldToday` is whether the day today's
// nudge is about (today in the evening, yesterday in the morning) is told.
export function rewindReminderDates({ hour, now, toldToday }: RewindReminderTimes, daysAhead = REMINDER_DAYS_AHEAD): Date[] {
  const out: Date[] = [];
  for (let ahead = 0; ahead < daysAhead; ahead++) {
    const when = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead, hour, 0, 0, 0);
    if (ahead === 0 && (toldToday || when.getTime() <= now.getTime())) continue;
    out.push(when);
  }
  return out;
}
