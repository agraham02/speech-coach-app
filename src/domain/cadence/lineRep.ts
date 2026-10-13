import type { MarkKind, MarkedText } from "./marks";

// The Mark It Up line rep: a few lines, each marked (or checked), read
// twice with the marks and once without. The adaptive level (1-10) decides
// how long the lines are and how much of the marking is yours — never the
// length of the text beyond two sentences. Pure.

export type MarkingMode =
  // the coach's marks are shown; you just read
  | "given"
  // the coach's stress is shown; you add the pauses and inflections
  | "add_pauses"
  // you mark everything, then compare with the coach
  | "mark_all";

export interface LineRepConfig {
  mode: MarkingMode;
  maxSentences: 1 | 2;
  maxWords: number;
  lines: number;
  // move the stress and read it again
  remix: boolean;
}

export function lineRepConfig(level: number): LineRepConfig {
  const l = Math.max(1, Math.min(10, Math.round(level)));
  if (l <= 3) return { mode: "given", maxSentences: 1, maxWords: 14, lines: 3, remix: false };
  if (l <= 6) return { mode: "add_pauses", maxSentences: 2, maxWords: 24, lines: 3, remix: false };
  return { mode: "mark_all", maxSentences: 2, maxWords: 40, lines: 3, remix: true };
}

// The kinds you place yourself in each mode (the rest come from the coach).
export function kindsYouMark(mode: MarkingMode): MarkKind[] {
  if (mode === "add_pauses") return ["pause", "long_pause", "rise", "fall"];
  if (mode === "mark_all") return ["emphasis", "pause", "long_pause", "rise", "fall"];
  return [];
}

export interface PickableLine extends MarkedText {
  id: string;
  category: string;
  sentences: number;
  wordCount: number;
}

// Picks `config.lines` lines that fit the level, preferring a category and
// avoiding recently practiced ones. Deterministic for a seed. `firstId`
// (a tapped card) always comes first, whatever its length.
export function pickLines<T extends PickableLine>(
  all: T[],
  config: LineRepConfig,
  seed: number,
  options: { category?: string; firstId?: string; recentIds?: string[] } = {},
): T[] {
  const fits = (l: T) => l.sentences <= config.maxSentences && l.wordCount <= config.maxWords;
  const recent = new Set(options.recentIds ?? []);
  const first = options.firstId ? all.find((l) => l.id === options.firstId) : undefined;
  const pool = all.filter((l) => l.id !== first?.id && fits(l) && (!options.category || l.category === options.category));
  const fresh = pool.filter((l) => !recent.has(l.id));
  const source = fresh.length >= config.lines ? fresh : pool.length ? pool : all.filter((l) => l.id !== first?.id);
  const picked: T[] = first ? [first] : [];
  const step = 7;
  for (let i = 0; picked.length < config.lines && i < source.length * step; i += step) {
    const candidate = source[(Math.abs(seed) + i) % source.length];
    if (!picked.includes(candidate)) picked.push(candidate);
  }
  return picked;
}

// Line of the day: one line, chosen by the date so it's the same all day.
export function lineOfTheDay<T extends PickableLine>(all: T[], date: string, hash: (s: string) => number): T {
  const short = all.filter((l) => l.wordCount <= 24);
  const pool = short.length ? short : all;
  return pool[hash(`line:${date}`) % pool.length];
}
