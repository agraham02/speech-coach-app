import { percentile } from "./pitchTracker";

// A candidate pitch cleanup for Signal Lab (docs/overhaul/PLAN.md, section
// 6.5, "Pitch cleanup"). It runs on the tracker's output and changes none of
// it in place; the lab compares the numbers before and after.
//
// Three steps, in this order:
//  1. Octave jumps. A voiced frame whose pitch is about a whole number of
//     octaves from the median of its neighbours (within `octaveToleranceSt`)
//     is moved to the octave that fits, or dropped when `dropOctaveJumps`.
//  2. A median filter over voiced frames. It runs inside each run of
//     consecutive voiced frames, so it never smooths across a gap.
//  3. An optional personal range limit: with `rangeMarginSt` set, frames
//     outside p5 to p95 of the cleaned pitch, widened by that margin, are
//     dropped. In the app the range would come from the Hum and siren check;
//     here it is learned from the take itself, which is the same idea with
//     less to go on.

export interface CleanPitchOptions {
  // A frame counts as voiced when f0 > 0 and confidence >= this.
  minConfidence?: number;
  // Median filter length in frames (odd). 1 turns the filter off.
  medianFrames?: number;
  // Frames each side used for the local median that octave jumps are judged
  // against (25 = 250 ms at a 10 ms hop).
  octaveWindowFrames?: number;
  // How close to a whole number of octaves counts as an octave jump (semitones).
  octaveToleranceSt?: number;
  // Neighbours needed before a frame can be judged at all.
  minNeighbours?: number;
  // Drop octave jumps instead of moving them.
  dropOctaveJumps?: boolean;
  // Set to switch on the personal range limit: p5 to p95 widened by this many
  // semitones either side.
  rangeMarginSt?: number;
}

export const CLEAN_PITCH_DEFAULTS = {
  minConfidence: 0,
  medianFrames: 5,
  octaveWindowFrames: 25,
  octaveToleranceSt: 2,
  minNeighbours: 6,
  dropOctaveJumps: false,
} as const;

export interface PitchCleanupCounts {
  voicedBefore: number;
  voicedAfter: number;
  // Frames moved to the octave that fits.
  octaveMoved: number;
  // Frames dropped as octave jumps.
  octaveDropped: number;
  // Frames the median filter changed.
  smoothed: number;
  // Frames dropped by the personal range limit.
  outOfRange: number;
  // Frames dropped for low confidence.
  lowConfidence: number;
  // The limits used by the range step (Hz), null when it was off.
  rangeHz: { lo: number; hi: number } | null;
}

export interface CleanedPitch {
  f0Hz: Float32Array;
  counts: PitchCleanupCounts;
}

export const semitonesBetween = (hz: number, refHz: number) => 12 * Math.log2(hz / refHz);

function medianOf(values: number[]): number {
  return percentile(values, 0.5);
}

export function cleanPitch(f0Hz: ArrayLike<number>, confidence?: ArrayLike<number>, opts: CleanPitchOptions = {}): CleanedPitch {
  const o = { ...CLEAN_PITCH_DEFAULTS, ...opts };
  const n = f0Hz.length;
  const out = new Float32Array(n);
  const counts: PitchCleanupCounts = {
    voicedBefore: 0,
    voicedAfter: 0,
    octaveMoved: 0,
    octaveDropped: 0,
    smoothed: 0,
    outOfRange: 0,
    lowConfidence: 0,
    rangeHz: null,
  };

  for (let i = 0; i < n; i++) {
    if (!(f0Hz[i] > 0)) continue;
    counts.voicedBefore++;
    if (confidence && confidence[i] < o.minConfidence) {
      counts.lowConfidence++;
      continue;
    }
    out[i] = f0Hz[i];
  }

  // 1. Octave jumps, judged against the raw neighbours so a run of wrong
  // frames cannot vouch for itself while the right ones are still around.
  const raw = Float32Array.from(out);
  for (let i = 0; i < n; i++) {
    if (!(raw[i] > 0)) continue;
    const near: number[] = [];
    for (let j = Math.max(0, i - o.octaveWindowFrames); j <= Math.min(n - 1, i + o.octaveWindowFrames); j++) {
      if (j !== i && raw[j] > 0) near.push(raw[j]);
    }
    if (near.length < o.minNeighbours) continue;
    const st = semitonesBetween(raw[i], medianOf(near));
    const octaves = Math.round(st / 12);
    if (octaves === 0 || Math.abs(st - 12 * octaves) > o.octaveToleranceSt) continue;
    if (o.dropOctaveJumps) {
      out[i] = 0;
      counts.octaveDropped++;
    } else {
      out[i] = raw[i] / 2 ** octaves;
      counts.octaveMoved++;
    }
  }

  // 2. Median filter inside each run of consecutive voiced frames. The window
  // shrinks at a run's edges rather than reaching into the next run.
  const half = Math.floor(Math.max(1, o.medianFrames) / 2);
  if (half > 0) {
    const before = Float32Array.from(out);
    let i = 0;
    while (i < n) {
      if (!(before[i] > 0)) {
        i++;
        continue;
      }
      let j = i;
      while (j < n && before[j] > 0) j++;
      for (let k = i; k < j; k++) {
        const a = Math.max(i, k - half);
        const b = Math.min(j - 1, k + half);
        const m = medianOf(Array.from(before.subarray(a, b + 1)));
        if (m !== before[k]) counts.smoothed++;
        out[k] = m;
      }
      i = j;
    }
  }

  // 3. Personal range.
  if (opts.rangeMarginSt !== undefined) {
    const st: number[] = [];
    for (let i = 0; i < n; i++) if (out[i] > 0) st.push(Math.log2(out[i]) * 12);
    if (st.length >= 20) {
      const lo = 2 ** ((percentile(st, 0.05) - opts.rangeMarginSt) / 12);
      const hi = 2 ** ((percentile(st, 0.95) + opts.rangeMarginSt) / 12);
      counts.rangeHz = { lo, hi };
      for (let i = 0; i < n; i++) {
        if (out[i] > 0 && (out[i] < lo || out[i] > hi)) {
          out[i] = 0;
          counts.outOfRange++;
        }
      }
    }
  }

  for (let i = 0; i < n; i++) if (out[i] > 0) counts.voicedAfter++;
  return { f0Hz: out, counts };
}
