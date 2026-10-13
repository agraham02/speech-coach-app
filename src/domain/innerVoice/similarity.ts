import { contentWords, stem } from "../conversation/text";

// Three things asks for something new every day, never a repeat. A repeat
// isn't only the same words: "I'm patient with people" and "I am patient
// with other people" are the same thing. So entries are compared on their
// content words (stemmed, ignoring filler), and near-matches are flagged.
// Pure.

// Overlap (0-1) at or above which two entries count as the same thing.
export const SIMILAR_AT = 0.6;

export interface PastEntry {
  id: string;
  text: string;
  date: string; // YYYY-MM-DD
}

const stems = (text: string): Set<string> => new Set(contentWords(text).map(stem));

const squash = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// How alike two entries are, 0 to 1 (Jaccard overlap of their content stems;
// entries with no content words fall back to comparing the plain text).
export function similarity(a: string, b: string): number {
  const x = stems(a);
  const y = stems(b);
  if (x.size === 0 || y.size === 0) return squash(a) === squash(b) && squash(a) !== "" ? 1 : 0;
  let shared = 0;
  x.forEach((s) => {
    if (y.has(s)) shared += 1;
  });
  return shared / (x.size + y.size - shared);
}

// The closest earlier entry, if it's close enough to count as a repeat.
export function similarEntry(text: string, history: PastEntry[], threshold = SIMILAR_AT): { entry: PastEntry; score: number } | null {
  let best: { entry: PastEntry; score: number } | null = null;
  for (const entry of history) {
    const score = similarity(text, entry.text);
    if (score >= threshold && (!best || score > best.score)) best = { entry, score };
  }
  return best;
}
