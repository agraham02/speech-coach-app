import { mentions, words } from "../conversation/text";
import { splitSentences } from "../cadence/sentences";

// What the phone can count about a spoken summary: sentences, how long they
// run, and how many long words it used. Pure.

// One unpunctuated run past this many words is not one sentence.
const RUN_ON_WORDS = 30;
const RUN_ON_CHUNK = 25;

export type SentenceSource = "punctuation" | "pauses" | "length";

export interface SentenceCount {
  sentences: string[];
  count: number;
  // How the transcript was cut. Pauses are a rougher guide than punctuation.
  source: SentenceSource;
}

const PUNCTUATED = /[.!?]\s*\S/;

// The recognizer's text may or may not carry punctuation. With it, sentences
// are cut there. Without it, the recognizer's own pause-separated segments
// stand in, and any single run of words past 30 is split in pieces of ~25 so
// an unbroken ramble can never pass for one sentence.
export function spokenSentences(transcript: string, segments?: string[]): SentenceCount {
  const text = transcript.trim();
  if (!text) return { sentences: [], count: 0, source: "punctuation" };
  const punctuated = PUNCTUATED.test(text);
  const base = punctuated || !segments || segments.length < 2 ? [text] : segments.map((s) => s.trim()).filter(Boolean);
  let source: SentenceSource = punctuated ? "punctuation" : base.length > 1 ? "pauses" : "length";
  const out: string[] = [];
  for (const chunk of base) {
    for (const part of splitSentences(chunk)) {
      const tokens = part.split(/\s+/).filter(Boolean);
      if (tokens.length > RUN_ON_WORDS) {
        const pieces = Math.ceil(tokens.length / RUN_ON_CHUNK);
        const size = Math.ceil(tokens.length / pieces);
        for (let i = 0; i < tokens.length; i += size) out.push(tokens.slice(i, i + size).join(" "));
        if (!punctuated && source !== "pauses") source = "length";
      } else if (tokens.length) {
        out.push(part);
      }
    }
  }
  return { sentences: out, count: out.length, source };
}

// A rough syllable count: vowel groups, minus a silent final e or -ed/-es.
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return w ? 1 : 0;
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

// Long words that are ordinary speech, not jargon.
const EVERYDAY_LONG = new Set(
  (
    "basically actually literally probably definitely obviously everything anything something everybody everyone anyone especially " +
    "important different interesting another example family favorite favourite usually generally seriously completely absolutely " +
    "personally honestly really tomorrow yesterday together beautiful incredible apparently eventually immediately especially " +
    "understand remember sometimes whenever wherever whatever nobody somebody animal animals"
  ).split(" "),
);

export const LONG_WORD_SYLLABLES = 3;

export interface PlainWords {
  total: number;
  long: string[];
  share: number;
}

// Words of three or more syllables, apart from the subject's own words and
// everyday ones, as a share of everything said.
export function longWords(transcript: string, keep: string[] = []): PlainWords {
  const own = new Set(keep.flatMap((k) => words(k)));
  const all = words(transcript);
  const long = all.filter((w) => syllables(w) >= LONG_WORD_SYLLABLES && !own.has(w) && !EVERYDAY_LONG.has(w));
  return { total: all.length, long: [...new Set(long)], share: all.length ? long.length / all.length : 0 };
}

export function averageSentenceWords(count: SentenceCount): number {
  if (!count.count) return 0;
  const total = count.sentences.reduce((n, s) => n + words(s).length, 0);
  return total / count.count;
}

// Which of these words (or short phrases) the speaker mentioned.
export function wordsHit(transcript: string, keyWords: string[]): string[] {
  return keyWords.filter((k) => mentions(transcript, k));
}
