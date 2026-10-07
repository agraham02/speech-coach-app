import { numericReadings } from "./numberWords";

// One heard (recognized) word, normalized for comparison. `readings` holds
// alternative spoken forms — currently only for numeric tokens, e.g. "11" ->
// ["eleven", "oneone"] — each already concatenated with no spaces.
export interface HeardToken {
  raw: string;
  norm: string;
  readings: string[];
}

// Spoken hesitations that recognizers sometimes emit. Stripped before
// alignment (they're never part of a target) but counted, since filler rate
// is its own coaching signal.
const FILLERS = new Set(["um", "umm", "uh", "uhh", "uhm", "er", "erm", "ah", "hmm", "mm"]);

// Lowercases and maps typographic quotes/dashes to ASCII, then turns every
// separator that can split a compound ("One-one", "and/or", "wait—what")
// into a space. Apostrophes are kept here so callers can still display them.
export function cleanText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[-‐-―/]/g, " ");
}

// The comparison key for a single word: letters and digits only, so
// "sheikh's" and "sheikhs" compare equal and trailing punctuation never
// matters.
export function normalizeWord(word: string): string {
  return cleanText(word).replace(/[^a-z0-9]/g, "");
}

export function isFiller(norm: string): boolean {
  return FILLERS.has(norm);
}

export interface TokenizedHeard {
  tokens: HeardToken[];
  fillerCount: number;
}

export function tokenizeHeard(text: string): TokenizedHeard {
  const tokens: HeardToken[] = [];
  let fillerCount = 0;
  for (const raw of cleanText(text).split(/\s+/)) {
    const norm = raw.replace(/[^a-z0-9]/g, "");
    if (!norm) continue;
    if (isFiller(norm)) {
      fillerCount += 1;
      continue;
    }
    tokens.push({ raw: raw.replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, ""), norm, readings: numericReadings(norm) });
  }
  return { tokens, fillerCount };
}
