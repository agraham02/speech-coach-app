export interface ReminderSettings {
  enabled: boolean;
  hour: number; // 24-hour, local time, on the hour — the first session's
  // Hours for top-up sessions 2 and 3 (daily goal above 1).
  extraHours?: number[];
  // 0 (Sunday) - 6 you plan to practice; empty/missing means every day.
  practiceDays?: number[];
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: false,
  hour: 19,
};

export type Period = "AM" | "PM";

const LAST_HOUR = 23;

export const periodOf = (hour: number): Period => (hour < 12 ? "AM" : "PM");

// 1-12 on a clock face.
export const clockHour = (hour: number): number => (hour % 12 === 0 ? 12 : hour % 12);

// The hours a period offers, as a dropdown lists them: 1, 2 ... 11, then 12
// (12 AM is hour 0, 12 PM is hour 12).
export function hoursInPeriod(period: Period): number[] {
  const start = period === "AM" ? 0 : 12;
  return [...Array.from({ length: 11 }, (_, i) => start + i + 1), start];
}

// Spaced default hours for a goal, anchored on the first reminder. Top-ups
// always come after the first session — Today only offers one once the main
// plan is done.
export function defaultExtraHours(firstHour: number, goal: number): number[] {
  if (goal <= 1) return [];
  const later = (h: number) => Math.min(LAST_HOUR, h);
  if (firstHour <= 9) return goal === 2 ? [later(firstHour + 9)] : [later(firstHour + 5), later(firstHour + 10)];
  if (firstHour <= 13) return goal === 2 ? [later(firstHour + 6)] : [later(firstHour + 4), later(firstHour + 8)];
  return goal === 2 ? [later(firstHour + 2)] : [later(firstHour + 1), later(firstHour + 2)];
}

// Every session's reminder hour, first to last: the user's picks with the
// spaced defaults filling any session they haven't set, forced into strictly
// increasing order (session 2 is always after session 1) and inside the day.
export function planSessionHours(firstHour: number, extraHours: number[] | undefined, goal: number): number[] {
  const count = Math.max(1, Math.min(3, goal));
  const defaults = defaultExtraHours(firstHour, count);
  const raw = [firstHour, ...defaults.map((h, i) => extraHours?.[i] ?? h)];
  const hours = raw.map((h) => Math.max(0, Math.min(LAST_HOUR, Math.round(h))));
  // Forward: each session at least an hour after the last.
  for (let i = 1; i < count; i++) hours[i] = Math.max(hours[i], hours[i - 1] + 1);
  // Backward: leave room in the day for the sessions still to come.
  for (let i = 0; i < count; i++) hours[i] = Math.min(hours[i], LAST_HOUR - (count - 1 - i));
  return hours;
}

export function reminderHours(settings: ReminderSettings, goal: number): number[] {
  return planSessionHours(settings.hour, settings.extraHours, goal);
}

export interface HourBounds {
  min: number;
  max: number;
}

// What session `index` may be set to: after the one before it (a hard
// limit), with room left for the ones after it.
export function sessionBounds(hours: number[], index: number): HourBounds {
  return { min: index === 0 ? 0 : hours[index - 1] + 1, max: LAST_HOUR - (hours.length - 1 - index) };
}

// Sets one session's hour. Later sessions that would no longer be after it
// move forward with it.
export function setSessionHour(hours: number[], index: number, hour: number): number[] {
  const { min, max } = sessionBounds(hours, index);
  const next = [...hours];
  next[index] = Math.max(min, Math.min(max, hour));
  for (let i = index + 1; i < next.length; i++) next[i] = Math.max(next[i], next[i - 1] + 1);
  return next;
}

export const hourAllowed = (hour: number, bounds: HourBounds): boolean => hour >= bounds.min && hour <= bounds.max;

export function periodHasValidHour(period: Period, bounds: HourBounds): boolean {
  return hoursInPeriod(period).some((h) => hourAllowed(h, bounds));
}

// The same clock hour in the other period; the nearest allowed hour when
// that one is out of bounds. Unchanged when the period has no allowed hour.
export function switchPeriod(hour: number, period: Period, bounds: HourBounds = { min: 0, max: LAST_HOUR }): number {
  const same = (clockHour(hour) % 12) + (period === "AM" ? 0 : 12);
  if (hourAllowed(same, bounds)) return same;
  const allowed = hoursInPeriod(period).filter((h) => hourAllowed(h, bounds));
  if (!allowed.length) return hour;
  return allowed.reduce((best, h) => (Math.abs(h - same) < Math.abs(best - same) ? h : best));
}

// Reminders are on the hour, so "7 PM" rather than "7:00 PM".
export function formatReminderHour(hour: number): string {
  return `${clockHour(hour)} ${periodOf(hour)}`;
}
