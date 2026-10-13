// "Today", "Yesterday" or "Mon, Oct 12" for a local YYYY-MM-DD. Pure.

const iso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function dayLabel(date: string, now: Date = new Date()): string {
  if (date === iso(now)) return "Today";
  if (date === iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return "Yesterday";
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// The evening the Rewind card starts to appear on Today (local hour).
export const REWIND_CARD_FROM_HOUR = 18;

export const rewindCardVisible = (now: Date, toldToday: boolean): boolean => !toldToday && now.getHours() >= REWIND_CARD_FROM_HOUR;
