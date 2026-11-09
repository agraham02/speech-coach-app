import { tokenizeHeard, type HeardToken } from "../speech/normalize";
import { alignFinal, buildTarget, type TargetWord } from "../speech/speechAlignment";

// Drills are scored from Whisper's reading of the saved clip (docs/overhaul/
// PLAN.md, 6.6), which gives each word a time. These are the pure rules that use
// those times: which word a start word belongs after, and whether a pause was
// held where the passage marks one. Pure.

export interface TimedWordInput {
  text: string;
  startMs: number;
  endMs: number;
}

export interface TimedToken extends HeardToken {
  startMs: number;
  endMs: number;
}

// The heard tokens of a transcript, each with its word's times. Fillers and
// empty words drop out exactly as in `tokenizeHeard`, so these line up with the
// tokens the scorers see; a word that splits ("one-one") shares its times.
export function timedTokens(words: TimedWordInput[]): TimedToken[] {
  const out: TimedToken[] = [];
  for (const word of words) {
    for (const token of tokenizeHeard(word.text).tokens) out.push({ ...token, startMs: word.startMs, endMs: word.endMs });
  }
  return out;
}

// Word chain: where in the heard words each start word's run begins, from the
// moment each was shown (ms since the clip began). The first run starts at 0; a
// later one starts at the first word spoken after its start word appeared.
export function chainStartsFromTimes(tokens: TimedToken[], shownAtMs: number[]): number[] {
  return shownAtMs.map((at, k) => {
    if (k === 0) return 0;
    const index = tokens.findIndex((t) => t.startMs >= at);
    return index < 0 ? tokens.length : index;
  });
}

// Pause reading: for each mark in the passage, the target word it follows. The
// passage marks pauses with "/" (short) and "//" (long) between words; the
// target words are split the way `buildTarget` splits them. A mark with no word
// after it can't be judged and is left out.
export function pauseMarkPositions(passage: string): number[] {
  const positions: number[] = [];
  let words = 0;
  for (const token of passage.trim().split(/\s+/)) {
    if (/^\/{1,2}$/.test(token)) {
      if (words > 0 && positions[positions.length - 1] !== words - 1) positions.push(words - 1);
      continue;
    }
    words += buildTarget(token).length;
  }
  // A mark after the very last word has nothing after it.
  return positions.filter((p) => p < words - 1);
}

export interface MarkPauses {
  // Marks in the passage that could be judged.
  marks: number;
  // Of those, the ones where a pause of at least `minPauseMs` was held.
  held: number;
}

// Whether a real pause came at each mark: the gap between the word before the mark
// and the word after it, by Whisper's times. A mark whose neighbouring words
// weren't heard can't have been held.
export function pausesAtMarks(target: TargetWord[], tokens: TimedToken[], after: number[], minPauseMs: number): MarkPauses {
  const ops = alignFinal(target, tokens);
  const heardFor = new Map<number, number>();
  for (const op of ops) {
    if (op.kind === "del" || op.kind === "ins" || !op.heardIdx.length) continue;
    for (const t of op.targetIdx) heardFor.set(t, op.heardIdx[op.heardIdx.length - 1]);
  }
  const firstHeardFor = new Map<number, number>();
  for (const op of ops) {
    if (op.kind === "del" || op.kind === "ins" || !op.heardIdx.length) continue;
    for (const t of op.targetIdx) firstHeardFor.set(t, op.heardIdx[0]);
  }
  let held = 0;
  for (const i of after) {
    const before = heardFor.get(i);
    const next = firstHeardFor.get(i + 1);
    if (before == null || next == null || next <= before) continue;
    if (tokens[next].startMs - tokens[before].endMs >= minPauseMs) held += 1;
  }
  return { marks: after.length, held };
}
