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

export type Period = "AM" | "PM";

export const periodOf = (hour: number): Period => (hour < 12 ? "AM" : "PM");

// 1-12 on a clock face.
export const clockHour = (hour: number): number => (hour % 12 === 0 ? 12 : hour % 12);

// The reminder hours a period offers (reminders run 6 AM - 10 PM).
export function hoursInPeriod(period: Period): number[] {
  return Array.from({ length: REMINDER_HOUR_MAX - REMINDER_HOUR_MIN + 1 }, (_, i) => REMINDER_HOUR_MIN + i).filter((h) => periodOf(h) === period);
}

// The same clock hour in the other period, kept inside the reminder window:
// 8 AM -> 8 PM, 11 AM -> 10 PM, 1 PM -> 6 AM.
export function switchPeriod(hour: number, period: Period): number {
  const base = clockHour(hour) % 12;
  return Math.min(REMINDER_HOUR_MAX, Math.max(REMINDER_HOUR_MIN, period === "AM" ? base : base + 12));
}

// Reminders are on the hour, so "7 PM" rather than "7:00 PM".
export function formatReminderHour(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour} ${period}`;
}
