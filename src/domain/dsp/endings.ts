import { SPEECH, type AudioFeatures } from "./audioFeatures";
import { semitonesBetween } from "./pitchCleanup";
import { percentile } from "./pitchTracker";

// A candidate ending reader for Signal Lab (docs/overhaul/PLAN.md, section
// 6.5, "Endings"): does the voice fall or rise at the end of a sentence?
//
// The slope is taken over the last 500 ms of voiced pitch, in semitones per
// second. Whisper's word end can land either side of where the voice stops: on a
// real read, the rise on "umbrella?" came after Whisper had ended the word. So the
// end first runs on to the close of the voice it sits in, by up to `extendMs`,
// then the window is anchored to the last voiced frame at or before that; with no
// voiced frame within `maxGapMs` (a whispered or dropped ending) there is no slope.
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
export const ENDING_EXTEND_MS = 300;
// Frames closer than this say little about a slope.
const MIN_PAIR_MS = 40;
export const ENDING_MIN_VOICED_FRAMES = 8;
export const ENDING_MAX_GAP_MS = 250;
export const ENDING_SLOPE_ST_PER_S = 3;

export type EndingKind = "rising" | "falling" | "flat";

export interface EndingOptions {
  windowMs?: number;
  minVoicedFrames?: number;
  maxGapMs?: number;
  extendMs?: number;
}

export function terminalSlope(features: Track, endMs: number, opts: EndingOptions = {}): number | null {
  const windowMs = opts.windowMs ?? ENDING_WINDOW_MS;
  const minVoiced = opts.minVoicedFrames ?? ENDING_MIN_VOICED_FRAMES;
  const maxGapMs = opts.maxGapMs ?? ENDING_MAX_GAP_MS;
  const { f0Hz, hopMs, offsetMs, speech } = features;
  const timeOf = (i: number) => offsetMs + i * hopMs;

  const endFrame = Math.min(f0Hz.length - 1, Math.floor((endMs - offsetMs) / hopMs));
  let close = endFrame;
  if (speech && speech[Math.max(0, endFrame)] === SPEECH) {
    const reach = Math.min(f0Hz.length - 1, endFrame + Math.round((opts.extendMs ?? ENDING_EXTEND_MS) / hopMs));
    while (close < reach && speech[close + 1] === SPEECH) close++;
  }
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
