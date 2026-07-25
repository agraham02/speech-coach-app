export function todayISODate(): string {
  return isoDateFromDate(new Date());
}

export function isoDateFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Parses a "YYYY-MM-DD" (or full ISO datetime, using just its date part) into
// a local midnight Date, so day-difference math isn't thrown off by time-of-day.
export function dateFromISODate(isoDateOrDatetime: string): Date {
  const [year, month, day] = isoDateOrDatetime.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function daysBetween(from: Date, to: Date): number {
  const MS_PER_DAY = 86_400_000;
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
