import type { TranscriptWord } from "../sessionTypes";
import type { AudioFeatures } from "./audioFeatures";
import { splitPhrases } from "./phrasePitch";

// Whisper's word times, lined up with the voice. Whisper starts its first
// segment at the top of the clip whatever is there, so any silence before the
// first word is folded into the first few words: on real takes the first word
// "starts" at about 0 ms while the voice starts 700 ms later. Signal Lab showed
// what that costs: a read with a 3 s lead-in came out 7% too slow, and the
// stressed word landed on a word further along the sentence.
//
// The energy gate knows when the voice is there, so it sets the edges:
//  - the first word starts when the voice starts, the last ends when it ends;
//  - a pause the gate found is pinned to the word boundary nearest it, so the
//    words on either side of it end and start at the pause's edges;
//  - between those anchors the words keep Whisper's proportions.
// It never stretches the words past where Whisper had them: a voice that goes
// on after the last word is something Whisper didn't write down, not more of it.
// Pure. The stored transcript keeps Whisper's own times.

type Track = Pick<AudioFeatures, "speech" | "hopMs" | "offsetMs">;

export const WORD_ALIGN = {
  // A run of voice shorter than this is a click or a cough, not a word.
  minRunMs: 100,
  minPauseMs: 300,
  // How far Whisper's boundary may sit from a pause and still be pinned to it.
  pauseMatchMs: 400,
};

interface Piece {
  firstWord: number;
  lastWord: number;
  startMs: number;
  endMs: number;
}

export function alignWordsToSpeech<W extends TranscriptWord>(words: W[] | null | undefined, features: Track): W[] | null {
  if (!words || words.length === 0) return words ?? null;
  const runs = splitPhrases(features, WORD_ALIGN.minPauseMs).filter((r) => r.endMs - r.startMs >= WORD_ALIGN.minRunMs);
  if (runs.length === 0) return words;

  const last = words.length - 1;
  const from = Math.max(words[0].startMs, runs[0].startMs);
  const to = Math.min(words[last].endMs, runs[runs.length - 1].endMs);
  if (to <= from) return words;

  const pieces: Piece[] = [];
  let firstWord = 0;
  let startMs = from;
  let nextBoundary = 0;
  for (let r = 0; r + 1 < runs.length; r++) {
    const pauseStart = runs[r].endMs;
    const pauseEnd = runs[r + 1].startMs;
    if (pauseStart <= startMs || pauseEnd >= to) continue;
    const middle = (pauseStart + pauseEnd) / 2;
    let best = -1;
    let bestGap: number = WORD_ALIGN.pauseMatchMs;
    for (let b = nextBoundary; b < last; b++) {
      const gap = Math.abs((words[b].endMs + words[b + 1].startMs) / 2 - middle);
      if (gap <= bestGap) {
        best = b;
        bestGap = gap;
      }
    }
    if (best === -1) continue;
    pieces.push({ firstWord, lastWord: best, startMs, endMs: pauseStart });
    firstWord = best + 1;
    startMs = pauseEnd;
    nextBoundary = best + 1;
  }
  pieces.push({ firstWord, lastWord: last, startMs, endMs: to });

  const out = words.map((w) => ({ ...w }));
  for (const p of pieces) {
    const a = words[p.firstWord].startMs;
    const b = words[p.lastWord].endMs;
    const scale = b > a ? (p.endMs - p.startMs) / (b - a) : 0;
    for (let i = p.firstWord; i <= p.lastWord; i++) {
      out[i].startMs = Math.round(p.startMs + (words[i].startMs - a) * scale);
      out[i].endMs = Math.round(p.startMs + (words[i].endMs - a) * scale);
    }
  }
  return out;
}
