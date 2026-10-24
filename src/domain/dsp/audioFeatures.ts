import { percentile, PITCH_TRACKER_VERSION, trackPitch } from "./pitchTracker";

// Everything the phone measures from a take's audio, on one 10 ms grid:
// pitch, its confidence, loudness, voice activity (speech, pause, breath)
// and syllable peaks. Pure and all worklets, so services/audio/dspRuntime.ts
// runs it on a background JS runtime; the words-aware summaries
// (domain/signals/audioSummary.ts) run on the result afterwards.
//
// Voice activity is an energy gate with hysteresis and an 80 ms hangover,
// ported from the session 05 spike (docs/research/spikes/signal-capture/
// volume_pauses.py): it found 7 of 9 true pauses through a simulated phone
// chain with breaths, where the old single-threshold gate found 1, because
// a breath no longer splits a pause in two. A short, quiet, unvoiced burst
// inside a silence is then tagged as a breath, so it neither splits a pause
// nor counts as speech.

export const AUDIO_EXTRACTOR_VERSION = `${PITCH_TRACKER_VERSION}+vad-hyst-1`;

// Frame labels in AudioFeatures.speech.
export const PAUSE = 0;
export const SPEECH = 1;
export const BREATH = 2;

export interface AudioFeatures {
  version: string;
  sampleRate: number;
  durationMs: number;
  // Frame i is centred at offsetMs + i * hopMs.
  hopMs: number;
  offsetMs: number;
  // Pitch in Hz, 0 = unvoiced.
  f0Hz: Float32Array;
  confidence: Float32Array;
  // Wideband loudness (dBFS) of a 10 ms window at each frame centre.
  levelDb: Float32Array;
  // PAUSE, SPEECH or BREATH per frame.
  speech: Uint8Array;
  // The quiet end of the take (p10 of frame levels).
  noiseFloorDb: number;
  // Syllable peaks: frame indices of 50 ms loudness peaks inside speech,
  // at least 120 ms apart with 3 dB prominence.
  peaks: Int32Array;
}

export const VAD = {
  // Speech starts this far over the floor and ends below on - offGap.
  onDb: 12,
  offGapDb: 6,
  // A floor this low is digital silence; the gate never opens below this.
  minOnDbfs: -55,
  hangFrames: 8,
  // A breath: 80-700 ms, nearly unvoiced, well under the speaking level,
  // with a silence on each side.
  breathMinFrames: 8,
  breathMaxFrames: 70,
  breathMaxVoiced: 0.15,
  breathBelowSpeechDb: 8,
  breathSideFrames: 10,
};

export const PEAKS = {
  smoothFrames: 5,
  minDistanceFrames: 12,
  prominenceDb: 3,
  // Peaks further than this under the median speech level are noise.
  belowMedianDb: 12,
  // How far each side to look for a peak's base.
  baseWindowFrames: 100,
};

function wideLevels(waveform: Float32Array, sampleRate: number, frames: number, hopMs: number, offsetMs: number): Float32Array {
  "worklet";
  const out = new Float32Array(frames);
  const half = Math.max(1, Math.round((sampleRate * 5) / 1000));
  for (let i = 0; i < frames; i++) {
    const c = Math.round(((offsetMs + i * hopMs) * sampleRate) / 1000);
    const a = Math.max(0, c - half);
    const b = Math.min(waveform.length, c + half);
    let e = 0;
    for (let j = a; j < b; j++) e += waveform[j] * waveform[j];
    out[i] = b > a && e > 0 ? Math.max(-100, 10 * Math.log10(e / (b - a))) : -100;
  }
  return out;
}

// Hysteresis gate over frame levels: speech when over `on`, and stays speech
// until the level has been under `off` for the hangover.
export function hysteresisGate(levels: Float32Array, floorDb: number): Uint8Array {
  "worklet";
  const on = Math.max(floorDb + VAD.onDb, VAD.minOnDbfs);
  const off = on - VAD.offGapDb;
  const out = new Uint8Array(levels.length);
  let state = false;
  let hang = 0;
  let lastLoud = -1;
  for (let i = 0; i < levels.length; i++) {
    const v = levels[i];
    if (v > on) {
      state = true;
      hang = VAD.hangFrames;
    } else if (v < off && state) {
      if (hang > 0) hang -= 1;
      else {
        // Speech ended: the quiet frames the hangover held go back to the
        // pause, so its edge sits where the level fell.
        state = false;
        for (let k = lastLoud + 1; k < i; k++) out[k] = PAUSE;
      }
    }
    if (state && v >= off) lastLoud = i;
    out[i] = state ? SPEECH : PAUSE;
  }
  return out;
}

// Median level of the speech frames, or the floor when there are none.
export function speechMedianDb(levels: Float32Array, speech: Uint8Array, floorDb: number): number {
  "worklet";
  const vals: number[] = [];
  for (let i = 0; i < levels.length; i++) if (speech[i] === SPEECH) vals.push(levels[i]);
  return vals.length ? percentile(vals, 0.5) : floorDb;
}

// Short, quiet, unvoiced speech runs with silence on both sides become
// breaths. Changes `speech` in place.
export function tagBreaths(speech: Uint8Array, levels: Float32Array, f0Hz: Float32Array, medianDb: number): void {
  "worklet";
  const n = speech.length;
  let i = 0;
  while (i < n) {
    if (speech[i] !== SPEECH) {
      i++;
      continue;
    }
    let j = i;
    let voiced = 0;
    let peak = -200;
    while (j < n && speech[j] === SPEECH) {
      if (f0Hz[j] > 0) voiced++;
      if (levels[j] > peak) peak = levels[j];
      j++;
    }
    const len = j - i;
    let before = 0;
    for (let k = i - 1; k >= 0 && speech[k] !== SPEECH && before < VAD.breathSideFrames; k--) before++;
    let after = 0;
    for (let k = j; k < n && speech[k] !== SPEECH && after < VAD.breathSideFrames; k++) after++;
    const quiet = peak < medianDb - VAD.breathBelowSpeechDb;
    const sided = before >= VAD.breathSideFrames && after >= VAD.breathSideFrames;
    if (len >= VAD.breathMinFrames && len <= VAD.breathMaxFrames && voiced / len <= VAD.breathMaxVoiced && quiet && sided) {
      for (let k = i; k < j; k++) speech[k] = BREATH;
    }
    i = j;
  }
}

// Syllable peaks: local maxima of 50 ms loudness inside speech, with at
// least `prominenceDb` over the higher of the two bases (the lowest point on
// each side before a higher point), greedily kept highest first at least
// `minDistanceFrames` apart.
export function syllablePeaks(levels: Float32Array, speech: Uint8Array, medianDb: number): Int32Array {
  "worklet";
  const n = levels.length;
  const k = PEAKS.smoothFrames;
  const half = Math.floor(k / 2);
  const smooth = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (speech[i] !== SPEECH) {
      smooth[i] = -120;
      continue;
    }
    let p = 0;
    let c = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) {
      p += Math.pow(10, levels[j] / 10);
      c++;
    }
    smooth[i] = 10 * Math.log10(Math.max(p / c, 1e-12));
  }
  const candidates: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    const v = smooth[i];
    if (speech[i] !== SPEECH || v < medianDb - PEAKS.belowMedianDb) continue;
    if (!(v > smooth[i - 1] && v >= smooth[i + 1])) continue;
    let leftMin = v;
    for (let j = i - 1; j >= Math.max(0, i - PEAKS.baseWindowFrames); j--) {
      if (smooth[j] > v) break;
      if (smooth[j] < leftMin) leftMin = smooth[j];
    }
    let rightMin = v;
    for (let j = i + 1; j <= Math.min(n - 1, i + PEAKS.baseWindowFrames); j++) {
      if (smooth[j] > v) break;
      if (smooth[j] < rightMin) rightMin = smooth[j];
    }
    if (v - Math.max(leftMin, rightMin) >= PEAKS.prominenceDb) candidates.push(i);
  }
  candidates.sort((a, b) => smooth[b] - smooth[a]);
  const taken = new Uint8Array(n);
  const kept: number[] = [];
  for (const c of candidates) {
    let clash = false;
    for (let j = Math.max(0, c - PEAKS.minDistanceFrames + 1); j <= Math.min(n - 1, c + PEAKS.minDistanceFrames - 1); j++) {
      if (taken[j]) {
        clash = true;
        break;
      }
    }
    if (clash) continue;
    taken[c] = 1;
    kept.push(c);
  }
  kept.sort((a, b) => a - b);
  return Int32Array.from(kept);
}

export function extractAudioFeatures(waveform: Float32Array, sampleRate: number): AudioFeatures {
  "worklet";
  const track = trackPitch(waveform, sampleRate);
  const frames = track.f0Hz.length;
  const levelDb = wideLevels(waveform, sampleRate, frames, track.hopMs, track.offsetMs);
  const noiseFloorDb = percentile(levelDb, 0.1);
  const speech = hysteresisGate(levelDb, noiseFloorDb);
  const medianDb = speechMedianDb(levelDb, speech, noiseFloorDb);
  tagBreaths(speech, levelDb, track.f0Hz, medianDb);
  const peaks = syllablePeaks(levelDb, speech, speechMedianDb(levelDb, speech, noiseFloorDb));
  return {
    version: AUDIO_EXTRACTOR_VERSION,
    sampleRate,
    durationMs: Math.round((waveform.length / sampleRate) * 1000),
    hopMs: track.hopMs,
    offsetMs: track.offsetMs,
    f0Hz: track.f0Hz,
    confidence: track.confidence,
    levelDb,
    speech,
    noiseFloorDb,
    peaks,
  };
}
