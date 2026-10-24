import type { SessionType } from "./sessionTypes";

// The Library's list: every recording you can open again, whatever made it.
// Sessions (impromptu takes, scripts, feelings) and Rewinds are stored apart
// (`sessions`, `day_recalls`), so the list is merged here in memory rather
// than with a SQL view: both are small, and each keeps its own mapper. Pure:
// the Library screen builds the items, this filters and searches them.

export type LibraryKind = "impromptu" | "script" | "feeling" | "rewind";

export const KIND_LABELS: Record<LibraryKind, string> = {
  impromptu: "Impromptu",
  script: "Script",
  feeling: "Feeling",
  rewind: "Rewind",
};

const KIND_ORDER: LibraryKind[] = ["impromptu", "rewind", "script", "feeling"];

export function kindForSessionType(type: SessionType): LibraryKind {
  if (type === "script_practice") return "script";
  if (type === "feeling") return "feeling";
  // Free practice and Say it short are impromptu speaking too.
  return "impromptu";
}

export type LibraryStatus = "recording" | "processing" | "done" | "error";

export interface LibraryItem<S = unknown, R = unknown> {
  key: string; // unique across both sources
  id: string;
  kind: LibraryKind;
  recordedAt: string; // ISO, UTC
  durationSeconds: number;
  title: string;
  category: string | null;
  transcript: string;
  status: LibraryStatus;
  overallScore: number | null;
  // Which layer the score is from: judged by Tono AI, or measured on the phone.
  scoreLayer?: "judged" | "measured" | null;
  keepsake: boolean;
  session: S | null;
  rewind: R | null;
}

export type DateRange = "all" | "week" | "month" | "quarter";

export const DATE_RANGES: { key: DateRange; label: string }[] = [
  { key: "all", label: "Any time" },
  { key: "week", label: "Past 7 days" },
  { key: "month", label: "Past 30 days" },
  { key: "quarter", label: "Past 3 months" },
];

const RANGE_DAYS: Record<Exclude<DateRange, "all">, number> = { week: 7, month: 30, quarter: 91 };

export function inDateRange(recordedAt: string, range: DateRange, now: Date = new Date()): boolean {
  if (range === "all") return true;
  const days = RANGE_DAYS[range];
  // From the start of the local day `days - 1` days ago, so "past 7 days"
  // is today and the six before it.
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1)).getTime();
  const at = new Date(recordedAt).getTime();
  return at >= from && at <= now.getTime() + 60_000;
}

export type DurationFilter = "all" | "short" | "medium" | "long";

export function durationBucket(durationSeconds: number): Exclude<DurationFilter, "all"> {
  if (durationSeconds < 120) return "short";
  if (durationSeconds < 240) return "medium";
  return "long";
}

// "keepsake": progress videos kept when old videos are cleared.
export type StatusFilter = "all" | "keepsake" | LibraryStatus;

export interface LibraryFilters {
  kind: "all" | LibraryKind;
  status: StatusFilter;
  category: string; // "all" or a prompt category
  duration: DurationFilter;
  date: DateRange;
}

export const NO_FILTERS: LibraryFilters = { kind: "all", status: "all", category: "all", duration: "all", date: "all" };

export function hasFilters(f: LibraryFilters): boolean {
  return f.kind !== "all" || f.status !== "all" || f.category !== "all" || f.duration !== "all" || f.date !== "all";
}

// The words a search can match for an item: what it was about, its type,
// what was said, and the day it was recorded in a few spellings ("oct",
// "october 12", "monday"), in local time. Built once per item.
export function searchText(item: LibraryItem, now: Date = new Date()): string {
  const date = new Date(item.recordedAt);
  const fmt = (o: Intl.DateTimeFormatOptions) => date.toLocaleDateString("en-US", o);
  const dayDiff = Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / 86_400_000,
  );
  const dates = [
    fmt({ month: "long", day: "numeric" }), // October 12
    fmt({ month: "short", day: "numeric" }), // Oct 12
    fmt({ weekday: "long" }),
    String(date.getFullYear()),
    `${date.getMonth() + 1}/${date.getDate()}`,
    dayDiff === 0 ? "today" : dayDiff === 1 ? "yesterday" : "",
  ];
  return [item.title, item.category ?? "", KIND_LABELS[item.kind], item.transcript, ...dates].join(" • ").toLowerCase();
}

// Every word of the query must appear somewhere ("rewind monday" finds
// Monday's Rewind).
export function matchesQuery(haystack: string, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every((t) => haystack.includes(t));
}

export function matchesFilters(item: LibraryItem, f: LibraryFilters, now: Date = new Date()): boolean {
  if (f.kind !== "all" && item.kind !== f.kind) return false;
  if (f.status === "keepsake") {
    if (!item.keepsake) return false;
  } else if (f.status !== "all" && item.status !== f.status) return false;
  if (f.duration !== "all" && durationBucket(item.durationSeconds) !== f.duration) return false;
  if (f.category !== "all" && item.category !== f.category) return false;
  return inDateRange(item.recordedAt, f.date, now);
}

// The type choices worth offering: only kinds you have recordings of, and
// only when there is more than one.
export function kindOptions(items: LibraryItem[]): { key: "all" | LibraryKind; label: string }[] {
  const present = new Set(items.map((i) => i.kind));
  const kinds = KIND_ORDER.filter((k) => present.has(k));
  if (kinds.length < 2) return [];
  return [{ key: "all", label: "All" }, ...kinds.map((k) => ({ key: k, label: KIND_LABELS[k] }))];
}

// A few words of what was said around the first search term found in it,
// for the row while searching. Null when the words didn't match.
export function transcriptExcerpt(transcript: string, query: string, radius = 28): string | null {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length || !transcript) return null;
  const lower = transcript.toLowerCase();
  const hits = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0);
  if (!hits.length) return null;
  const at = Math.min(...hits);
  let start = Math.max(0, at - radius);
  let end = Math.min(transcript.length, at + radius * 2);
  // Whole words at both ends.
  if (start > 0) start = transcript.indexOf(" ", start) + 1 || start;
  if (end < transcript.length) {
    const space = transcript.lastIndexOf(" ", end);
    if (space > at) end = space;
  }
  const text = transcript.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${text}${end < transcript.length ? "…" : ""}`;
}

// Newest first, the way the list reads.
export function sortNewestFirst<T extends { recordedAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}
