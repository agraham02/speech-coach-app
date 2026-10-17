// Rebuilding words with timings from whisper.cpp token-level segments.

export interface RawSegment {
  text: string;
  t0: number;
  t1: number;
}

export interface TimedWord {
  text: string;
  startMs: number;
  endMs: number;
}

// whisper.cpp segment times are in units of 10 ms.
export const WHISPER_TIME_UNIT_MS = 10;

const SPECIAL_TOKEN = /^\[_[A-Z]+_?\d*\]$/;

// Token-level segments (maxLen 1 with token timestamps) back into words: a
// piece that starts with a space begins a new word; one that does not
// (a word ending, or punctuation) joins the word before it.
export function wordsFromSegments(segments: RawSegment[], unitMs = WHISPER_TIME_UNIT_MS): TimedWord[] {
  const words: TimedWord[] = [];
  let open = false;
  for (const segment of segments) {
    const trimmed = segment.text.trim();
    if (!trimmed || SPECIAL_TOKEN.test(trimmed)) continue;
    const startMs = Math.round(segment.t0 * unitMs);
    const endMs = Math.round(segment.t1 * unitMs);
    const startsWord = /^\s/.test(segment.text) || !open;
    if (startsWord) {
      words.push({ text: trimmed, startMs, endMs });
      open = true;
    } else {
      const last = words[words.length - 1];
      last.text += trimmed;
      last.endMs = Math.max(last.endMs, endMs);
    }
  }
  return words;
}
