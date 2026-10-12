import { cardinalWords } from "../speech/numberWords";

// One-breath count: breathe in low, then count aloud — "one, two, three…" —
// at an easy pace until the breath runs out. How far you get is breath
// control; how fast you went keeps it honest (rushing squeezes more numbers
// into the same air). Pure.

// Recognizers write a count as words ("one two three"), digits ("1 2 3"),
// digits run together ("12345"), or mishear the small ones.
const SOUNDS_LIKE: Record<string, number> = { won: 1, to: 2, too: 2, tree: 3, free: 3, for: 4, fore: 4, ate: 8 };

const WORDS = new Map<string, number>();
for (let n = 1; n < 100; n++) {
  const words = cardinalWords(n);
  if (words?.length === 1) WORDS.set(words[0], n);
}

// More than this many numbers a second is rushing, not breath control.
export const MAX_COUNT_RATE = 3;

// The highest number reached counting up from 1. Anything that isn't the
// next number is ignored, and one dropped number is forgiven at a time
// (recognizers lose the odd word) — so the count can't be inflated by
// saying "fifty".
export function countReached(heard: string[]): number {
  const tokens = heard.flatMap((t) => t.split(/[-–—]/));
  let next = 1;
  const accept = (value: number | undefined): boolean => {
    if (value === next) next += 1;
    else if (value === next + 1) next += 2;
    else return false;
    return true;
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i].toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!token) continue;

    if (/^\d+$/.test(token)) {
      // "45678" while expecting 4 -> 4, 5, 6, 7, 8.
      let rest = token;
      while (rest) {
        const here = String(next);
        const skip = String(next + 1);
        if (rest.startsWith(here)) {
          rest = rest.slice(here.length);
          next += 1;
        } else if (rest.startsWith(skip)) {
          rest = rest.slice(skip.length);
          next += 2;
        } else break;
      }
      continue;
    }

    let value = WORDS.get(token);
    // "twenty one" arrives as two words.
    if (value != null && value >= 20 && value % 10 === 0 && i + 1 < tokens.length) {
      const ones = WORDS.get(tokens[i + 1].toLowerCase().replace(/[^a-z]/g, ""));
      if (ones != null && ones < 10 && (value + ones === next || value + ones === next + 1)) {
        value += ones;
        i += 1;
      }
    }
    if (accept(value)) continue;
    // A misheard small number only counts when it's the one expected.
    const alike = SOUNDS_LIKE[token];
    if (alike != null && alike === next) next += 1;
  }
  return next - 1;
}

// Numbers per second, or null when too little was said to tell.
export function countRate(count: number, speakingMs: number): number | null {
  if (count < 4 || speakingMs <= 0) return null;
  return Math.round((count / (speakingMs / 1000)) * 10) / 10;
}
