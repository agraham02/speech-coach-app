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
