import { SPEECH, type AudioFeatures } from "./audioFeatures";
import { semitonesBetween } from "./pitchCleanup";
import { percentile } from "./pitchTracker";

// A candidate ending reader for Signal Lab (docs/overhaul/PLAN.md, section
// 6.5, "Endings"): does the voice fall or rise at the end of a sentence?
//
// The slope is taken over the last 500 ms of voiced pitch, in semitones per
// second. Whisper's word end is only roughly where the sentence ends. On real
// reads it landed up to 1.6 s after the voice had stopped, and before the rise on
// "umbrella?" had happened. So the sentence's end is the pause nearest Whisper's
// end, and only without one does Whisper's end stand. In talk with no pause at a
// sentence's end this can read an earlier phrase's ending instead. The
// window is anchored to the last voiced frame before that; with no voiced frame
// within `maxGapMs` (a whispered or dropped ending) there is no slope.
//
// The line is the median of the slopes between frames (Theil-Sen), not a
// least-squares fit. Real endings go creaky and leave only a few frames, and in a
// least-squares fit one stray frame could turn a fall into a rise.
//
// Thresholds. A falling statement drops about 2 to 6 semitones over its last
// word, and a question rises a similar amount. 3 st/s (1.5 semitones across the
// window) sits clear of jitter on a steady voice and still catches a mild lift,
// so: slope >= +3 is rising, <= -3 is falling, between is flat.

type Track = Pick<AudioFeatures, "f0Hz" | "hopMs" | "offsetMs"> & Partial<Pick<AudioFeatures, "speech">>;

export const ENDING_WINDOW_MS = 500;
// How far either side of Whisper's end to look for the pause.
export const ENDING_SEARCH_BACK_MS = 1800;
export const ENDING_SEARCH_AHEAD_MS = 700;
// A gap this long is a pause, not a consonant.
const ENDING_PAUSE_MS = 200;
// Frames closer than this say little about a slope.
const MIN_PAIR_MS = 40;
export const ENDING_MIN_VOICED_FRAMES = 8;
// Real endings fade: the voice can stop this far before the pause (creak, a breath).
export const ENDING_MAX_GAP_MS = 600;
export const ENDING_SLOPE_ST_PER_S = 3;

export type EndingKind = "rising" | "falling" | "flat";

export interface EndingOptions {
  windowMs?: number;
  minVoicedFrames?: number;
  maxGapMs?: number;
  searchBackMs?: number;
  searchAheadMs?: number;
}

// The last speech frame before the pause nearest `endFrame`, or `endFrame`.
function closeOfSentence(speech: Uint8Array, endFrame: number, hopMs: number, opts: EndingOptions): number {
  const n = speech.length;
  const from = Math.max(0, endFrame - Math.round((opts.searchBackMs ?? ENDING_SEARCH_BACK_MS) / hopMs));
  const to = Math.min(n - 1, endFrame + Math.round((opts.searchAheadMs ?? ENDING_SEARCH_AHEAD_MS) / hopMs));
  const pauseFrames = Math.round(ENDING_PAUSE_MS / hopMs);
  let best = -1;
  let bestGap = Infinity;
  for (let i = from; i <= to; i++) {
    if (speech[i] !== SPEECH || i + 1 >= n || speech[i + 1] === SPEECH) continue;
    let j = i + 1;
    while (j < n && speech[j] !== SPEECH) j++;
    if (j - i - 1 < pauseFrames) continue;
    const gap = Math.abs(i - endFrame);
    if (gap < bestGap) {
      best = i;
      bestGap = gap;
    }
  }
  return best === -1 ? endFrame : best;
}

export function terminalSlope(features: Track, endMs: number, opts: EndingOptions = {}): number | null {
  const windowMs = opts.windowMs ?? ENDING_WINDOW_MS;
  const minVoiced = opts.minVoicedFrames ?? ENDING_MIN_VOICED_FRAMES;
  const maxGapMs = opts.maxGapMs ?? ENDING_MAX_GAP_MS;
  const { f0Hz, hopMs, offsetMs, speech } = features;
  const timeOf = (i: number) => offsetMs + i * hopMs;

  const endFrame = Math.min(f0Hz.length - 1, Math.floor((endMs - offsetMs) / hopMs));
  const close = speech && endFrame >= 0 ? closeOfSentence(speech, endFrame, hopMs, opts) : endFrame;
  let last = close;
  while (last >= 0 && !(f0Hz[last] > 0)) last--;
  if (last < 0 || timeOf(close) - timeOf(last) > maxGapMs) return null;
  const from = timeOf(last) - windowMs;

  const xs: number[] = [];
  const hz: number[] = [];
  for (let i = last; i >= 0 && timeOf(i) >= from; i--) {
    if (f0Hz[i] > 0) {
      xs.push(timeOf(i) / 1000);
      hz.push(f0Hz[i]);
    }
  }
  if (xs.length < minVoiced) return null;
  const ref = percentile(hz, 0.5);
  const ys = hz.map((v) => semitonesBetween(v, ref));
  const slopes: number[] = [];
  for (let a = 0; a < xs.length; a++) {
    for (let b = a + 1; b < xs.length; b++) {
      const dt = xs[a] - xs[b];
      if (Math.abs(dt) * 1000 >= MIN_PAIR_MS) slopes.push((ys[a] - ys[b]) / dt);
    }
  }
  return slopes.length ? Math.round(percentile(slopes, 0.5) * 100) / 100 : null;
}

export function classifyEnding(slopeStPerS: number | null): EndingKind | null {
  if (slopeStPerS === null || !Number.isFinite(slopeStPerS)) return null;
  if (slopeStPerS >= ENDING_SLOPE_ST_PER_S) return "rising";
  if (slopeStPerS <= -ENDING_SLOPE_ST_PER_S) return "falling";
  return "flat";
}
