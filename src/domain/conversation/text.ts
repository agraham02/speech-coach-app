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

// A crude stem so a picked-up topic word matches across inflections:
// singular and plural must land on the same key ("vintage"/"vintages",
// "address"/"addresses", "movie"/"movies", "gum"/"gums"), as must
// "dispatch"/"dispatching"/"dispatched". Not a linguistic stemmer — only
// ever compared with another stem().
export function stem(norm: string): string {
  let w = norm;
  if (w.length <= 3) return w;
  // Plurals.
  if (w.endsWith("ies") && w.length > 4) w = w.slice(0, -2); // movies -> movi, candies -> candi
  else if (w.endsWith("es") && /(s|x|z|ch|sh)es$/.test(w)) w = w.slice(0, -2); // addresses, dispatches
  else if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && !w.endsWith("is")) w = w.slice(0, -1);
  // Verb endings, then an undoubled consonant ("running" -> "run").
  for (const suffix of ["ing", "ed"]) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 3) {
      w = w.slice(0, -suffix.length);
      if (/([b-df-hj-np-rtv-z])\1$/.test(w) && !/(ll|ss|zz)$/.test(w)) w = w.slice(0, -1);
      break;
    }
  }
  // Final y/e so "candy"/"candi" and "vintage"/"vintag" agree.
  if (w.length > 3 && w.endsWith("y")) w = `${w.slice(0, -1)}i`;
  else if (w.length > 3 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
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
