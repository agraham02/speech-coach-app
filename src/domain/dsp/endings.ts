import type { AudioFeatures } from "./audioFeatures";
import { semitonesBetween } from "./pitchCleanup";
import { percentile } from "./pitchTracker";

// A candidate ending reader for Signal Lab (docs/overhaul/PLAN.md, section
// 6.5, "Endings"): does the voice fall or rise at the end of a sentence?
//
// The slope is a least-squares line through the voiced pitch of the last
// 300 ms, in semitones per second. Whisper's word end can land a little after
// the voice stops, so the window is anchored to the last voiced frame at or
// before the sentence end; with no voiced frame within `maxGapMs` of the end
// (a whispered or dropped ending) there is no slope.
//
// Thresholds. A falling statement drops about 2 to 6 semitones over its last
// word, which is -7 to -20 st/s over 300 ms; a question rises a similar
// amount. After the median filter, tracker jitter on a steady voice stays
// well under 1 st/s over 300 ms. 3 st/s (about 1 semitone across the window)
// sits clear of that and still catches a mild lift, so: slope >= +3 is
// rising, <= -3 is falling, between is flat. For comparison, the existing
// uptalk flag in audioSummary.ts wants a 2.5 st rise over the window (8.3
// st/s), which is stricter and only looks at statements.

type Track = Pick<AudioFeatures, "f0Hz" | "hopMs" | "offsetMs">;

export const ENDING_WINDOW_MS = 300;
export const ENDING_MIN_VOICED_FRAMES = 8;
export const ENDING_MAX_GAP_MS = 250;
export const ENDING_SLOPE_ST_PER_S = 3;

export type EndingKind = "rising" | "falling" | "flat";

export interface EndingOptions {
  windowMs?: number;
  minVoicedFrames?: number;
  maxGapMs?: number;
}

export function terminalSlope(features: Track, endMs: number, opts: EndingOptions = {}): number | null {
  const windowMs = opts.windowMs ?? ENDING_WINDOW_MS;
  const minVoiced = opts.minVoicedFrames ?? ENDING_MIN_VOICED_FRAMES;
  const maxGapMs = opts.maxGapMs ?? ENDING_MAX_GAP_MS;
  const { f0Hz, hopMs, offsetMs } = features;
  const timeOf = (i: number) => offsetMs + i * hopMs;

  let last = Math.min(f0Hz.length - 1, Math.floor((endMs - offsetMs) / hopMs));
  while (last >= 0 && !(f0Hz[last] > 0)) last--;
  if (last < 0 || endMs - timeOf(last) > maxGapMs) return null;
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
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let k = 0; k < xs.length; k++) {
    num += (xs[k] - mx) * (ys[k] - my);
    den += (xs[k] - mx) ** 2;
  }
  return den > 0 ? Math.round((num / den) * 100) / 100 : null;
}

export function classifyEnding(slopeStPerS: number | null): EndingKind | null {
  if (slopeStPerS === null || !Number.isFinite(slopeStPerS)) return null;
  if (slopeStPerS >= ENDING_SLOPE_ST_PER_S) return "rising";
  if (slopeStPerS <= -ENDING_SLOPE_ST_PER_S) return "falling";
  return "flat";
}
