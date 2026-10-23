// CANDIDATE, not used by the pipeline yet: only the Dev tab's Voice Lab runs
// it, next to the current tracker, so it can be checked on a phone before
// session 06 adopts it. See docs/research/signal-capture.md.
//
// Proposed replacement for analyzePitchVolume's pitch half: a dense YIN with
// a real voicing decision and light, speech-aware post-processing.
//
// Plain TypeScript (type annotations only), so the offline spike in
// docs/research/spikes/signal-capture runs this same file under
// `node --experimental-strip-types`. Pure, no dependencies, MIT-clean (an
// original implementation of de Cheveigne & Kawahara 2002, not derived from
// aubio, whose GPL code pitchfinder's YIN carries).
//
// What it changes against the current tracker (audioAnalysis.ts):
// - one frame every 10 ms instead of one 64 ms frame per 200 ms bucket;
// - the signal is band-limited (60-1000 Hz) and decimated to 8 kHz first, so
//   each frame is 4x cheaper and formants pull less on the period estimate;
// - when no dip passes the 0.15 threshold the global minimum is taken (as
//   the YIN paper does), and voicing is decided from that dip's depth plus
//   the frame energy over the take's own noise floor, instead of returning
//   null for anything above 0.1;
// - octave jumps are folded back toward the take's median, frames that jump
//   more than 5 semitones from their neighbours are repaired (2x, 1/2, 3/2,
//   2/3) or dropped, isolated frames are dropped and 1-frame gaps filled,
//   then a 3-frame median smooths it.

export interface PitchFrame {
  tMs: number;
  f0Hz: number | null;
  // 0-1, 1 - the YIN aperiodicity at the chosen lag (only for voiced frames).
  confidence: number;
  // Frame level (dBFS) of the band-limited signal.
  levelDb: number;
}

export interface PitchTrack {
  hopMs: number;
  frames: PitchFrame[];
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

const DEFAULTS: Required<PitchOptions> = {
  minHz: 60,
  maxHz: 500,
  hopMs: 10,
  threshold: 0.15,
  maxAperiodicity: 0.35,
  minSnrDb: 10,
};

// Second-order sections (biquads), direct form I.
function biquad(x: Float32Array, b0: number, b1: number, b2: number, a1: number, a2: number): Float32Array {
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
function lowpass(x: Float32Array, fs: number, fc: number): Float32Array {
  const w = (2 * Math.PI * fc) / fs, q = Math.SQRT1_2;
  const alpha = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + alpha;
  return biquad(x, (1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0, (-2 * c) / a0, (1 - alpha) / a0);
}

function highpass(x: Float32Array, fs: number, fc: number): Float32Array {
  const w = (2 * Math.PI * fc) / fs, q = Math.SQRT1_2;
  const alpha = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + alpha;
  return biquad(x, (1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, (-2 * c) / a0, (1 - alpha) / a0);
}

function percentile(values: number[], p: number): number {
  if (!values.length) return -100;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
}

function median(values: number[]): number {
  return percentile(values, 0.5);
}

export function trackPitch(waveform: Float32Array, sampleRate: number, options: PitchOptions = {}): PitchTrack {
  const o = { ...DEFAULTS, ...options };
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
  const levels = new Array<number>(frameCount);
  for (let f = 0; f < frameCount; f++) {
    const start = f * hop;
    let e = 0;
    for (let j = 0; j < win; j++) e += s[start + j] * s[start + j];
    levels[f] = e > 0 ? Math.max(-100, 10 * Math.log10(e / win)) : -100;
  }
  const noiseFloorDb = percentile(levels, 0.1);

  const d = new Float64Array(maxLag + 2);
  const raw: { f0: number | null; ap: number }[] = new Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    const start = f * hop;
    if (levels[f] < noiseFloorDb + o.minSnrDb) {
      raw[f] = { f0: null, ap: 1 };
      continue;
    }
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
    if (ap > o.maxAperiodicity) {
      raw[f] = { f0: null, ap };
      continue;
    }
    // Parabolic interpolation around the minimum.
    const a = d[best - 1], b = d[best], c = d[best + 1];
    const denom = a - 2 * b + c;
    const shift = denom > 0 ? (0.5 * (a - c)) / denom : 0;
    raw[f] = { f0: fs / (best + Math.max(-0.5, Math.min(0.5, shift))), ap };
  }

  // Octave folding toward the take's median pitch.
  const voiced = raw.filter((r) => r.f0 !== null).map((r) => r.f0 as number);
  const center = voiced.length ? median(voiced) : 0;
  const f0s: (number | null)[] = raw.map((r) => {
    if (r.f0 === null || center === 0) return r.f0;
    let v = r.f0;
    const st = () => 12 * Math.log2(v / center);
    if (st() > 9 && v / 2 >= o.minHz) v /= 2;
    else if (st() < -9 && v * 2 <= o.maxHz) v *= 2;
    return v;
  });

  // Local continuity: a frame more than 5 semitones from the median of its
  // voiced neighbours (+-120 ms) is a subharmonic or harmonic error (YIN's
  // typical 2x, 1/2, 3/2 and 2/3 mistakes). Try those ratios; if none lands
  // within 2 semitones of the neighbours, drop the frame.
  const RATIOS = [0.5, 2, 2 / 3, 1.5, 1 / 3, 3];
  const fixed = f0s.slice();
  for (let i = 0; i < f0s.length; i++) {
    const v = f0s[i];
    if (v === null) continue;
    const near: number[] = [];
    for (let k = Math.max(0, i - 12); k <= Math.min(f0s.length - 1, i + 12); k++) {
      const w = f0s[k];
      if (k !== i && w !== null) near.push(w);
    }
    if (near.length < 4) continue;
    const local = median(near);
    if (Math.abs(12 * Math.log2(v / local)) <= 5) continue;
    let repaired: number | null = null;
    for (const r of RATIOS) {
      const c = v * r;
      if (c >= o.minHz && c <= o.maxHz && Math.abs(12 * Math.log2(c / local)) <= 2) { repaired = c; break; }
    }
    fixed[i] = repaired;
  }
  for (let i = 0; i < f0s.length; i++) f0s[i] = fixed[i];

  // Drop voiced runs shorter than 3 frames; fill single-frame gaps.
  for (let i = 0; i < f0s.length; ) {
    if (f0s[i] === null) { i++; continue; }
    let j = i;
    while (j < f0s.length && f0s[j] !== null) j++;
    if (j - i < 3) for (let k = i; k < j; k++) f0s[k] = null;
    i = j;
  }
  for (let i = 1; i < f0s.length - 1; i++) {
    if (f0s[i] === null && f0s[i - 1] !== null && f0s[i + 1] !== null) {
      const ratio = (f0s[i + 1] as number) / (f0s[i - 1] as number);
      if (ratio > 0.85 && ratio < 1.18) f0s[i] = Math.sqrt((f0s[i - 1] as number) * (f0s[i + 1] as number));
    }
  }
  // 3-frame median inside voiced runs.
  const smooth = f0s.slice();
  for (let i = 1; i < f0s.length - 1; i++) {
    const a = f0s[i - 1], b = f0s[i], c = f0s[i + 1];
    if (a !== null && b !== null && c !== null) smooth[i] = Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
  }

  const hopMs = (hop / fs) * 1000;
  const offsetMs = ((win + 0) / 2 / fs) * 1000; // frame center
  const frames: PitchFrame[] = smooth.map((f0, i) => ({
    tMs: i * hopMs + offsetMs,
    f0Hz: f0,
    confidence: f0 === null ? 0 : Math.max(0, 1 - raw[i].ap),
    levelDb: levels[i],
  }));
  return { hopMs, frames, noiseFloorDb };
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
}

export function summarizePitch(track: PitchTrack): PitchSummary {
  const voiced = track.frames.filter((f) => f.f0Hz !== null).map((f) => f.f0Hz as number);
  if (voiced.length < 20) return { voicedFrames: voiced.length, medianHz: null, sdSemitones: null, rangeSemitones: null };
  const med = median(voiced);
  const st = voiced.map((v) => 12 * Math.log2(v / med));
  const mean = st.reduce((a, b) => a + b, 0) / st.length;
  const sd = Math.sqrt(st.reduce((a, b) => a + (b - mean) ** 2, 0) / st.length);
  return {
    voicedFrames: voiced.length,
    medianHz: med,
    sdSemitones: Math.round(sd * 100) / 100,
    rangeSemitones: Math.round((percentile(st, 0.9) - percentile(st, 0.1)) * 100) / 100,
  };
}
