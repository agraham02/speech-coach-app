// When to nudge you to tell your day. Pure.

// How many evenings ahead are armed, so a few days away from the app still
// get their nudge.
export const REMINDER_DAYS_AHEAD = 7;

export interface RewindReminderTimes {
  hour: number;
  now: Date;
  toldToday: boolean;
}

// The evenings to nudge: today's (if the hour hasn't passed and you haven't
// told your day yet) and the ones after.
export function rewindReminderDates({ hour, now, toldToday }: RewindReminderTimes, daysAhead = REMINDER_DAYS_AHEAD): Date[] {
  const out: Date[] = [];
  for (let ahead = 0; ahead < daysAhead; ahead++) {
    const when = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead, hour, 0, 0, 0);
    if (ahead === 0 && (toldToday || when.getTime() <= now.getTime())) continue;
    out.push(when);
  }
  return out;
}
