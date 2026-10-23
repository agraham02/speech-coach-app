import type { TranscriptWord } from "../sessionTypes";

// Follow-along playback: which word is being said at a moment, whether a
// transcript's timings can be trusted for that, and where a tapped word or
// a scrub lands. Pure, so the shared player (components/playback) stays thin.

// Speeds the player cycles through: a little slower for catching detail,
// faster for skimming. Pitch is kept at every speed.
export const PLAYBACK_RATES = [1, 1.25, 1.5, 0.75] as const;

export function nextRate(rate: number): number {
  const i = PLAYBACK_RATES.findIndex((r) => r === rate);
  return PLAYBACK_RATES[(i + 1) % PLAYBACK_RATES.length];
}

export function rateLabel(rate: number): string {
  return `${rate}×`;
}

// A tapped word starts a moment early, so its first sound isn't clipped
// (Whisper's token times can run a little late).
export const WORD_PRE_ROLL_MS = 120;

// The last word that has started by `ms` (binary search, so a long take costs
// nothing per tick). -1 before the first word. Between words it stays on the
// one just said, so the marker rests through a pause instead of vanishing.
export function activeWordIndex(words: readonly TranscriptWord[], ms: number): number {
  let lo = 0;
  let hi = words.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].startMs <= ms) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

// Whether word timings can drive a follow-along at all: there are some, they
// run forward, and they fit the recording. Evenly spread or estimated timings
// would pass this, but no source in the app produces those today (the live
// recognizer and the cloud review give no timings, so they're stored as null).
export function hasUsableTimings(words: readonly TranscriptWord[] | null | undefined, durationMs?: number): words is TranscriptWord[] {
  if (!words?.length) return false;
  let last = -1;
  let backwards = 0;
  for (const w of words) {
    if (!Number.isFinite(w.startMs) || !Number.isFinite(w.endMs) || w.startMs < 0) return false;
    if (w.startMs < last) backwards++;
    last = w.startMs;
  }
  // A few out-of-order tokens happen; a shuffled list doesn't follow along.
  if (backwards > Math.max(2, words.length * 0.05)) return false;
  if (words[words.length - 1].endMs <= 0) return false;
  // Words far past the end mean the timings belong to some other audio.
  if (durationMs && durationMs > 0 && words[0].startMs > durationMs + 2000) return false;
  return true;
}

// Where playback jumps when a word is tapped.
export function seekTargetForWord(word: TranscriptWord): number {
  return Math.max(0, word.startMs - WORD_PRE_ROLL_MS);
}

export function clampMs(ms: number, durationMs: number): number {
  if (!Number.isFinite(ms)) return 0;
  return Math.min(Math.max(0, ms), Math.max(0, durationMs));
}

// A finger at `x` on a track `width` wide, as a time.
export function msAtX(x: number, width: number, durationMs: number): number {
  if (width <= 0 || durationMs <= 0) return 0;
  return clampMs((x / width) * durationMs, durationMs);
}

// "1:05" — minutes and seconds, for the scrubber.
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// The scrubber's spoken value: "1 minute 5 seconds of 2 minutes".
export function spokenClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  const parts = [m ? `${m} minute${m === 1 ? "" : "s"}` : "", s || !m ? `${s} second${s === 1 ? "" : "s"}` : ""].filter(Boolean);
  return parts.join(" ");
}

// Played to (nearly) the end: pressing play again starts over.
export function atEnd(positionMs: number, durationMs: number): boolean {
  return durationMs > 0 && positionMs >= durationMs - 250;
}
