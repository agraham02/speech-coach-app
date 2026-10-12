export interface ReminderSettings {
  enabled: boolean;
  hour: number; // 24-hour, local time, on the hour — the first session's
  // Hours for top-up sessions 2 and 3 (daily goal above 1).
  extraHours?: number[];
  // 0 (Sunday) - 6 you plan to practice; empty/missing means every day.
  practiceDays?: number[];
}

// The reminder hour for each session of the daily goal, first to last.
export function reminderHours(settings: ReminderSettings, goal: number): number[] {
  return [settings.hour, ...(settings.extraHours ?? [])].slice(0, Math.max(1, goal));
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
