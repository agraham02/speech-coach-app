// Three things: a daily run of writing down things you like about yourself.
// A round is 30 days of entries (days, not necessarily in a row). Pure.

export const RUN_DAYS = 30;
// Most entries in one day.
export const MAX_PER_DAY = 3;

// run: a round in progress. light: one a day, no end. paused: nothing daily;
// an old entry resurfaces now and then.
export type RunMode = "run" | "light" | "paused";

export interface RunState {
  round: number;
  mode: RunMode;
}

export const DEFAULT_RUN: RunState = { round: 1, mode: "run" };

export interface DatedEntry {
  date: string; // YYYY-MM-DD
  round: number;
}

// Different days with an entry in this round.
export function runDays(entries: DatedEntry[], round: number): number {
  return new Set(entries.filter((e) => e.round === round).map((e) => e.date)).size;
}

// Whether a round has been completed and its wrap-up is next: only while a
// round is running (once you choose what's next, the mode moves on).
export function atCapstone(entries: DatedEntry[], state: RunState): boolean {
  return state.mode === "run" && runDays(entries, state.round) >= RUN_DAYS;
}

// How many a day to aim for: three while a round runs, one when keeping it light.
export function dailyAim(state: RunState): number {
  return state.mode === "light" ? 1 : MAX_PER_DAY;
}

// Entries to show on a morning card in the paused mode: one of the past
// entries, the same all day and a different one tomorrow.
export function resurfaced<T>(entries: T[], today: string): T | null {
  if (!entries.length) return null;
  let h = 0;
  for (const ch of today) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return entries[h % entries.length];
}
