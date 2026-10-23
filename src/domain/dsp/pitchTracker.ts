// The app's pitch tracker: a dense YIN with a real voicing decision and
// light, speech-aware post-processing. Replaced pitchfinder (GPL-3.0, one
// 64 ms frame per 200 ms bucket, which threw away 80 to 90% of the voice;
// see docs/research/signal-capture.md, section 2).
//
// Plain TypeScript (type annotations only), so the offline spike in
// docs/research/spikes/signal-capture runs this same file under
// `node --experimental-strip-types`. Pure, no dependencies, MIT-clean (an
// original implementation of de Cheveigne & Kawahara 2002, not derived from
// aubio). Every function is a worklet, so services/audio/dspRuntime.ts can
// run it on a background JS runtime instead of the JS thread; called
// directly (tests, the spike), the directive is just a string.
//
// How it works:
// - the signal is band-limited (minHz*0.9 to 1000 Hz) and decimated to about
//   8 kHz, so each frame is 4x cheaper and formants pull less on the period;
// - one frame every 10 ms, two periods of the lowest pitch long;
// - when no dip passes the threshold the global minimum is taken (as the YIN
//   paper does), and voicing is decided from that dip's depth plus the frame
//   energy over the take's own noise floor;
// - octave jumps are folded back toward the take's median, frames that jump
//   more than 5 semitones from their neighbours are repaired (2x, 1/2, 3/2,
//   2/3, 3x, 1/3) or dropped, isolated frames are dropped and 1-frame gaps
//   filled, then a 3-frame median smooths it.
//
// Low and high voices: the search runs from 60 to 600 Hz, which covers a
// bass speaking voice (about 75 to 110 Hz median, dipping toward 60) up to a
// high voice's emphasis (about 500 Hz). Everything a score reads is in
// semitones around the speaker's own median, so a low voice is never asked
// to move twice as far musically as a high one.

export interface PitchTrack {
  // Frame spacing and the time of frame 0's centre, in ms.
  hopMs: number;
  offsetMs: number;
  // Per frame. f0 0 = unvoiced.
  f0Hz: Float32Array;
  // 0-1, 1 - the YIN aperiodicity at the chosen lag (0 when unvoiced).
  confidence: Float32Array;
  // Frame level (dBFS) of the band-limited signal.
  levelDb: Float32Array;
  noiseFloorDb: number;
}

export interface PitchOptions {
  minHz?: number;
  maxHz?: number;
  hopMs?: number;
  // YIN absolute threshold for the first dip.
  threshold?: number;
  // Max aperiodicity (CMND value at the chosen lag) still called voiced.
  maxAperiodicity?: number;
  // Frames must be this far above the take's noise floor (dB).
  minSnrDb?: number;
}

export const PITCH_DEFAULTS: Required<PitchOptions> = {
  minHz: 60,
  maxHz: 600,
  hopMs: 10,
  threshold: 0.15,
  maxAperiodicity: 0.35,
  minSnrDb: 10,
};

// Bump when the tracker's output changes, so stored feature tracks say
// which version made them.
export const PITCH_TRACKER_VERSION = "yin-dense-2";

// Second-order sections (biquads), direct form I.
function biquad(x: Float32Array, b0: number, b1: number, b2: number, a1: number, a2: number): Float32Array {
  "worklet";
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    const yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = xi; y2 = y1; y1 = yi;
    y[i] = yi;
  }
  return y;
}

// RBJ cookbook Butterworth-Q biquads.
export function lowpass(x: Float32Array, fs: number, fc: number): Float32Array {
  "worklet";
  const w = (2 * Math.PI * fc) / fs, q = Math.SQRT1_2;
  const alpha = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + alpha;
  return biquad(x, (1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0, (-2 * c) / a0, (1 - alpha) / a0);
}

export function highpass(x: Float32Array, fs: number, fc: number): Float32Array {
  "worklet";
  const w = (2 * Math.PI * fc) / fs, q = Math.SQRT1_2;
  const alpha = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + alpha;
  return biquad(x, (1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, (-2 * c) / a0, (1 - alpha) / a0);
}

// p in 0..1, nearest-rank on a sorted copy. -100 for no values.
export function percentile(values: ArrayLike<number>, p: number): number {
  "worklet";
  if (!values.length) return -100;
  const s = Array.from(values).sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
}

function median(values: number[]): number {
  "worklet";
  return percentile(values, 0.5);
}

function semitones(v: number, ref: number): number {
  "worklet";
  return 12 * Math.log2(v / ref);
}

export function trackPitch(waveform: Float32Array, sampleRate: number, options: PitchOptions = {}): PitchTrack {
  "worklet";
  const o = { ...PITCH_DEFAULTS, ...options };
  // Band-limit, then decimate to ~8 kHz (an integer factor of the input rate).
  const factor = Math.max(1, Math.round(sampleRate / 8000));
  let x = highpass(waveform, sampleRate, o.minHz * 0.9);
  x = lowpass(lowpass(x, sampleRate, 1000), sampleRate, 1000);
  const fs = sampleRate / factor;
  const n = Math.floor(x.length / factor);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = x[i * factor];

  const minLag = Math.max(2, Math.floor(fs / o.maxHz));
  const maxLag = Math.ceil(fs / o.minHz);
  const win = maxLag * 2; // integration window: two periods of the lowest pitch
  const hop = Math.max(1, Math.round((o.hopMs / 1000) * fs));
  const frameCount = Math.max(0, Math.floor((n - win - maxLag - 2) / hop) + 1);

  // Frame levels first, for the noise floor.
  const levels = new Float32Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    const start = f * hop;
    let e = 0;
    for (let j = 0; j < win; j++) e += s[start + j] * s[start + j];
    levels[f] = e > 0 ? Math.max(-100, 10 * Math.log10(e / win)) : -100;
  }
  const noiseFloorDb = percentile(levels, 0.1);

  const d = new Float64Array(maxLag + 2);
  const rawF0 = new Float64Array(frameCount); // 0 = unvoiced
  const rawAp = new Float64Array(frameCount).fill(1);
  for (let f = 0; f < frameCount; f++) {
    const start = f * hop;
    if (levels[f] < noiseFloorDb + o.minSnrDb) continue;
    // Difference function d(tau) = e0 + e_tau - 2 r(tau), with running energies.
    let e0 = 0;
    for (let j = 0; j < win; j++) e0 += s[start + j] * s[start + j];
    let eTau = e0;
    d[0] = 0;
    for (let tau = 1; tau <= maxLag + 1; tau++) {
      const out = s[start + tau - 1], inn = s[start + win + tau - 1];
      eTau += inn * inn - out * out;
      let r = 0;
      for (let j = 0; j < win; j++) r += s[start + j] * s[start + j + tau];
      d[tau] = e0 + eTau - 2 * r;
    }
    // Cumulative mean normalized difference.
    let running = 0;
    d[0] = 1;
    for (let tau = 1; tau <= maxLag + 1; tau++) {
      running += d[tau];
      d[tau] = running > 0 ? (d[tau] * tau) / running : 1;
    }
    let best = -1;
    for (let tau = minLag; tau <= maxLag; tau++) {
      if (d[tau] < o.threshold) {
        while (tau + 1 <= maxLag && d[tau + 1] < d[tau]) tau++;
        best = tau;
        break;
      }
    }
    if (best === -1) {
      // No dip under the threshold: take the global minimum, but prefer the
      // first local minimum nearly as deep (a dip at the true period is
      // often only a little shallower than the one at 2 or 1.5 periods).
      let min = Infinity, argmin = minLag;
      for (let tau = minLag; tau <= maxLag; tau++) if (d[tau] < min) { min = d[tau]; argmin = tau; }
      for (let tau = minLag; tau <= maxLag; tau++) {
        if (d[tau] <= min + 0.1 && d[tau] <= d[tau - 1] && d[tau] <= d[tau + 1]) { best = tau; break; }
      }
      if (best === -1) best = argmin;
    }
    // Sub-multiple check: if a dip at half (or a third) of the chosen lag is
    // nearly as deep, the chosen lag was two (three) periods.
    for (const k of [2, 3]) {
      const guess = Math.round(best / k);
      if (guess - 2 < minLag) continue;
      let c = guess;
      for (let t = guess - 2; t <= guess + 2; t++) if (d[t] < d[c]) c = t;
      if (d[c] < 0.3 && d[c] < d[best] + 0.1) { best = c; break; }
    }
    const ap = d[best];
    rawAp[f] = ap;
    if (ap > o.maxAperiodicity) continue;
    // Parabolic interpolation around the minimum.
    const a = d[best - 1], b = d[best], c = d[best + 1];
    const denom = a - 2 * b + c;
    const shift = denom > 0 ? (0.5 * (a - c)) / denom : 0;
    rawF0[f] = fs / (best + Math.max(-0.5, Math.min(0.5, shift)));
  }

  // Octave folding toward the take's median pitch.
  const voiced: number[] = [];
  for (let i = 0; i < frameCount; i++) if (rawF0[i] > 0) voiced.push(rawF0[i]);
  const center = voiced.length ? median(voiced) : 0;
  const f0s = new Float64Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    let v = rawF0[i];
    if (v > 0 && center > 0) {
      const st = semitones(v, center);
      if (st > 9 && v / 2 >= o.minHz) v /= 2;
      else if (st < -9 && v * 2 <= o.maxHz) v *= 2;
    }
    f0s[i] = v;
  }

  // Local continuity: a frame more than 5 semitones from the median of its
  // voiced neighbours (+-120 ms) is a subharmonic or harmonic error (YIN's
  // typical 2x, 1/2, 3/2 and 2/3 mistakes). Try those ratios; if none lands
  // within 2 semitones of the neighbours, drop the frame.
  const RATIOS = [0.5, 2, 2 / 3, 1.5, 1 / 3, 3];
  const fixed = f0s.slice();
  for (let i = 0; i < frameCount; i++) {
    const v = f0s[i];
    if (v <= 0) continue;
    const near: number[] = [];
    for (let k = Math.max(0, i - 12); k <= Math.min(frameCount - 1, i + 12); k++) {
      if (k !== i && f0s[k] > 0) near.push(f0s[k]);
    }
    if (near.length < 4) continue;
    const local = median(near);
    if (Math.abs(semitones(v, local)) <= 5) continue;
    let repaired = 0;
    for (const r of RATIOS) {
      const c = v * r;
      if (c >= o.minHz && c <= o.maxHz && Math.abs(semitones(c, local)) <= 2) { repaired = c; break; }
    }
    fixed[i] = repaired;
  }
  for (let i = 0; i < frameCount; i++) f0s[i] = fixed[i];

  // Drop voiced runs shorter than 3 frames; fill single-frame gaps.
  for (let i = 0; i < frameCount; ) {
    if (f0s[i] <= 0) { i++; continue; }
    let j = i;
    while (j < frameCount && f0s[j] > 0) j++;
    if (j - i < 3) for (let k = i; k < j; k++) f0s[k] = 0;
    i = j;
  }
  for (let i = 1; i < frameCount - 1; i++) {
    if (f0s[i] <= 0 && f0s[i - 1] > 0 && f0s[i + 1] > 0) {
      const ratio = f0s[i + 1] / f0s[i - 1];
      if (ratio > 0.85 && ratio < 1.18) f0s[i] = Math.sqrt(f0s[i - 1] * f0s[i + 1]);
    }
  }
  // 3-frame median inside voiced runs.
  const f0Hz = new Float32Array(frameCount);
  const confidence = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    const b = f0s[i];
    if (b <= 0) continue;
    let v = b;
    if (i > 0 && i < frameCount - 1 && f0s[i - 1] > 0 && f0s[i + 1] > 0) {
      const a = f0s[i - 1], c = f0s[i + 1];
      v = Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
    }
    f0Hz[i] = v;
    confidence[i] = Math.max(0, 1 - rawAp[i]);
  }

  return {
    hopMs: (hop / fs) * 1000,
    offsetMs: (win / 2 / fs) * 1000, // frame centre
    f0Hz,
    confidence,
    levelDb: levels,
    noiseFloorDb,
  };
}

// Summary statistics a score should use: semitones relative to the
// speaker's own median, so a low voice is not penalised for moving fewer Hz.
export interface PitchSummary {
  voicedFrames: number;
  medianHz: number | null;
  // Standard deviation of pitch in semitones around the median.
  sdSemitones: number | null;
  // p10 to p90 spread in semitones.
  rangeSemitones: number | null;
  // Mean YIN confidence of the voiced frames, 0-1.
  meanConfidence: number | null;
}

// Fewer voiced frames than this (0.2 s) and there is nothing to summarize.
const MIN_VOICED_FRAMES = 20;

export function summarizePitch(track: Pick<PitchTrack, "f0Hz" | "confidence">): PitchSummary {
  "worklet";
  const voiced: number[] = [];
  let conf = 0;
  for (let i = 0; i < track.f0Hz.length; i++) {
    if (track.f0Hz[i] > 0) {
      voiced.push(track.f0Hz[i]);
      conf += track.confidence[i];
    }
  }
  if (voiced.length < MIN_VOICED_FRAMES) {
    return { voicedFrames: voiced.length, medianHz: null, sdSemitones: null, rangeSemitones: null, meanConfidence: null };
  }
  const med = median(voiced);
  const st = voiced.map((v) => semitones(v, med));
  const mean = st.reduce((a, b) => a + b, 0) / st.length;
  const sd = Math.sqrt(st.reduce((a, b) => a + (b - mean) ** 2, 0) / st.length);
  return {
    voicedFrames: voiced.length,
    medianHz: Math.round(med * 10) / 10,
    sdSemitones: Math.round(sd * 100) / 100,
    rangeSemitones: Math.round((percentile(st, 0.9) - percentile(st, 0.1)) * 100) / 100,
    meanConfidence: Math.round((conf / voiced.length) * 100) / 100,
  };
}
