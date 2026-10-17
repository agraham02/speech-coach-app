// Pure helpers for the Dev tab's log viewer. Kept free of the log store (and
// its storage dependency) so they can be unit-tested.

export type LogLevelFilter = "all" | "warn" | "error";

export interface LogLike {
  id?: string;
  timestamp?: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface LogFilter {
  level: LogLevelFilter;
  tags: string[];
  query: string;
}

export const NO_FILTER: LogFilter = { level: "all", tags: [], query: "" };

const TAG_RE = /^\[([a-z0-9_-]+)[^\]]*\]/i;

// The leading "[tag]" of a message ("[pipeline] …" -> "pipeline"). The suffix
// some tags carry ("[uncaught, fatal]") is dropped.
export function logTag(message: string): string | null {
  const match = TAG_RE.exec(message);
  return match ? match[1].toLowerCase() : null;
}

export function firstLine(message: string): string {
  const i = message.indexOf("\n");
  return i === -1 ? message : message.slice(0, i);
}

// Lines after the first (a crash stack, a pasted JSON).
export function extraLineCount(message: string): number {
  return message.split("\n").length - 1;
}

const RANK = { info: 0, warn: 1, error: 2 } as const;

export function isFiltering(filter: LogFilter): boolean {
  return filter.level !== "all" || filter.tags.length > 0 || filter.query.trim() !== "";
}

export function filterLogs<T extends LogLike>(entries: T[], filter: LogFilter): T[] {
  const min = filter.level === "all" ? 0 : RANK[filter.level];
  const query = filter.query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (RANK[entry.level] < min) return false;
    if (filter.tags.length > 0) {
      const tag = logTag(entry.message);
      if (!tag || !filter.tags.includes(tag)) return false;
    }
    return !query || entry.message.toLowerCase().includes(query);
  });
}

// Tags present in the entries, most frequent first (ties alphabetical).
export function tagCounts(entries: LogLike[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const tag = logTag(entry.message);
    if (tag) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

// Entries at or above a level whose timestamp is within the window.
export function countRecent(entries: LogLike[], level: "warn" | "error", windowMs: number, now = Date.now()): number {
  let n = 0;
  for (const entry of entries) {
    if (RANK[entry.level] < RANK[level] || !entry.timestamp) continue;
    if (now - new Date(entry.timestamp).getTime() <= windowMs) n += 1;
  }
  return n;
}

// Plain text, oldest first, for the Share sheet. Entries are newest-first.
export function formatLogLines(entries: LogLike[]): string {
  return [...entries]
    .reverse()
    .map((e) => `${e.timestamp ?? ""} [${e.level}] ${e.message}`)
    .join("\n");
}
