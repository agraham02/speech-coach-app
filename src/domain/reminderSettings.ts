export interface ReminderSettings {
  enabled: boolean;
  hour: number; // 24-hour, local time, on the hour
}

export const REMINDER_HOUR_MIN = 6;
export const REMINDER_HOUR_MAX = 22;

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: false,
  hour: 19,
};

export function formatReminderHour(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:00 ${period}`;
}

// The next moment worth nudging you: later today at `hour` if that time
// hasn't passed yet and you haven't practiced today, otherwise tomorrow at
// `hour`. Used to arm a one-shot notification (rather than a recurring daily
// one) so a day you've already practiced never gets a redundant nudge.
export function computeNextReminderDate(hour: number, hasPracticedToday: boolean, now: Date = new Date()): Date {
  const todayAtHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0);
  if (!hasPracticedToday && todayAtHour.getTime() > now.getTime()) {
    return todayAtHour;
  }
  const tomorrowAtHour = new Date(todayAtHour);
  tomorrowAtHour.setDate(tomorrowAtHour.getDate() + 1);
  return tomorrowAtHour;
}
