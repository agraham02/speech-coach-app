import { stem, words } from "../conversation/text";

// Whether you said a sentence, judged only by its words showing up in what
// the recognizer heard — never how it sounded. Live recognition has no
// punctuation or capitals, so only the words count. Pure.

// Share of the sentence's words that must be heard.
export const SAID_AT = 0.8;

// 0-1: how much of `target` was heard in `heard` (order doesn't matter, and
// repeats in the target need repeats in what was heard).
export function saidRatio(target: string, heard: string): number {
  const want = words(target).map(stem);
  if (!want.length) return 0;
  const have = new Map<string, number>();
  for (const w of words(heard).map(stem)) have.set(w, (have.get(w) ?? 0) + 1);
  let matched = 0;
  for (const w of want) {
    const left = have.get(w) ?? 0;
    if (left > 0) {
      matched += 1;
      have.set(w, left - 1);
    }
  }
  return matched / want.length;
}

export const saidIt = (target: string, heard: string): boolean => saidRatio(target, heard) >= SAID_AT;
