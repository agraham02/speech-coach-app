import { normalizeWord, tokenizeHeard } from "../speech/normalize";

// Small text helpers shared by the conversation analyzers. Live recognition
// runs with punctuation off, so nothing here may depend on ".", "?" or
// capitals being present — they're a bonus when a transcript has them.

// Function words that say nothing about *what* was talked about. Used to
// find the content words a follow-up could pick up ("Portugal", "food").
const STOPWORDS = new Set(
  (
    "a an the and or but so if then than that this these those there here it its it's i i'm im me my mine we us our you your " +
    "he him his she her they them their what which who whom whose when where why how is am are was were be been being do does did " +
    "doing have has had having will would can could should shall may might must of to in on at by for with about from into over " +
    "under up down out off just really very quite also too not no yes yeah okay ok oh well like um uh er hmm kind sort lot lots " +
    "thing things stuff get got go going went gonna wanna gotta some any all every each one ones much many more most other another " +
    "again still even ever only own same such way back now today know think thought mean said say says see saw tell told make made " +
    "let lets let's i've ive i'd id i'll ill you're youre you've youve that's thats what's whats it'll don't dont didn't didnt " +
    "doesn't doesnt isn't isnt wasn't wasnt can't cant won't wont"
  ).split(" "),
);

export function isStopword(norm: string): boolean {
  return STOPWORDS.has(norm);
}

// Normalized tokens (letters/digits only, fillers dropped).
export function words(text: string): string[] {
  return tokenizeHeard(text).tokens.map((t) => t.norm);
}

// A crude stem so "dispatching"/"dispatched"/"dispatches" match "dispatch".
// Good enough for spotting a picked-up topic word; not a linguistic stemmer.
export function stem(norm: string): string {
  if (norm.length <= 4) return norm;
  for (const suffix of ["ing", "ies", "ed", "es", "s"]) {
    if (norm.endsWith(suffix) && norm.length - suffix.length >= 3) {
      const base = norm.slice(0, -suffix.length);
      return suffix === "ies" ? `${base}y` : base;
    }
  }
  return norm;
}

export function contentWords(text: string): string[] {
  return words(text).filter((w) => w.length >= 3 && !isStopword(w));
}

// Whether `text` mentions `phrase` (one word or a short phrase), comparing
// stems word by word.
export function mentions(text: string, phrase: string): boolean {
  const hay = words(text).map(stem);
  const needle = phrase
    .split(/\s+/)
    .map((w) => stem(normalizeWord(w)))
    .filter(Boolean);
  if (needle.length === 0) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (needle.every((n, j) => hay[i + j] === n)) return true;
  }
  return false;
}

// Splits a transcript into sentence-like chunks: punctuation when present,
// otherwise the recognizer's own pause-separated utterances if the caller
// has them.
export function sentences(text: string, segments?: string[]): string[] {
  if (segments && segments.length > 1) return segments.map((s) => s.trim()).filter(Boolean);
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
