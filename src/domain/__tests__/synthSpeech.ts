// Synthetic speech with known pitch, levels and pauses, for the signal tests
// (a small TypeScript cousin of docs/research/spikes/signal-capture/synth.py).
// Each syllable is a buzzy voiced tone (harmonics with falling amplitude)
// whose pitch follows a known contour; short noise bursts stand in for
// consonants; phrases are separated by pauses, optionally with a breath in
// the middle. A low noise floor runs throughout. Deterministic.

export const FS = 16000;

export interface SynthOptions {
  // Speaker's median pitch.
  baseHz?: number;
  // Each syllable's pitch offset is drawn from +-accentSt semitones.
  accentSt?: number;
  // Each syllable's level offset is drawn from +-accentDb.
  accentDb?: number;
  // Syllables per phrase, and phrases.
  syllables?: number;
  phrases?: number;
  syllableMs?: number;
  pauseMs?: number;
  // A breath (band noise, 250 ms) in the middle of each pause.
  breaths?: boolean;
  // Rise over the last syllable of every phrase, in semitones (uptalk).
  finalRiseSt?: number;
  // Level drop of the last syllable of every phrase, in dB (trailing off).
  finalDropDb?: number;
  seed?: number;
  // Linear amplitude of the voice at 0 dB.
  amplitude?: number;
}

export interface SynthTruth {
  // Every syllable's pitch, Hz, and level offset, dB.
  syllableHz: number[];
  syllableDb: number[];
  // [startMs, endMs] of every pause between phrases.
  pauses: [number, number][];
  // [startMs, endMs] of every phrase.
  phraseSpans: [number, number][];
}

function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function synthSpeech(o: SynthOptions = {}): { wave: Float32Array; truth: SynthTruth } {
  const baseHz = o.baseHz ?? 120;
  const accentSt = o.accentSt ?? 3;
  const accentDb = o.accentDb ?? 3;
  const syllables = o.syllables ?? 6;
  const phrases = o.phrases ?? 5;
  const syllableMs = o.syllableMs ?? 200;
  const pauseMs = o.pauseMs ?? 700;
  const amp = o.amplitude ?? 0.08;
  const rand = rng(o.seed ?? 7);
  const out: number[] = [];
  const truth: SynthTruth = { syllableHz: [], syllableDb: [], pauses: [], phraseSpans: [] };
  const ms = () => (out.length / FS) * 1000;
  const silence = (durMs: number) => {
    for (let i = 0; i < (durMs * FS) / 1000; i++) out.push(0);
  };
  const noise = (durMs: number, level: number) => {
    const n = Math.round((durMs * FS) / 1000);
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.sin((Math.PI * i) / n);
      const white = rand() * 2 - 1;
      // A crude band-pass: difference of white noise (high-pass) smoothed once.
      const v = white - prev;
      prev = white;
      out.push(v * level * w);
    }
  };

  silence(500);
  let phase = 0;
  for (let p = 0; p < phrases; p++) {
    const phraseStart = ms();
    for (let s = 0; s < syllables; s++) {
      const last = s === syllables - 1;
      const st = (rand() * 2 - 1) * accentSt;
      const db = (rand() * 2 - 1) * accentDb - (last ? o.finalDropDb ?? 0 : 0);
      const f0 = baseHz * Math.pow(2, st / 12);
      truth.syllableHz.push(f0);
      truth.syllableDb.push(db);
      const a = amp * Math.pow(10, db / 20);
      const n = Math.round((syllableMs * FS) / 1000);
      for (let i = 0; i < n; i++) {
        const rise = last && o.finalRiseSt ? Math.pow(2, ((o.finalRiseSt * i) / n) / 12) : 1;
        phase += (2 * Math.PI * f0 * rise) / FS;
        let v = 0;
        for (let h = 1; h <= 12; h++) v += Math.sin(h * phase) / h;
        const env = Math.min(1, i / (0.02 * FS), (n - i) / (0.02 * FS));
        out.push(a * v * env);
      }
      // A consonant between syllables.
      if (!last) noise(50, amp * 0.25);
    }
    truth.phraseSpans.push([phraseStart, ms()]);
    if (p < phrases - 1) {
      const start = ms();
      if (o.breaths) {
        silence((pauseMs - 250) / 2);
        noise(250, amp * 0.05);
        silence((pauseMs - 250) / 2);
      } else {
        silence(pauseMs);
      }
      truth.pauses.push([start, ms()]);
    }
  }
  silence(500);
  const wave = new Float32Array(out.length);
  for (let i = 0; i < out.length; i++) wave[i] = out[i] + (rand() - 0.5) * 0.0006;
  return { wave, truth };
}

// A steady or gliding buzzy tone, for the pitch tracker tests.
export function voicedTone(f0: (t: number) => number, seconds: number, padSeconds = 0.5, amplitude = 0.05): Float32Array {
  const pad = Math.round(padSeconds * FS);
  const n = Math.round(seconds * FS);
  const out = new Float32Array(n + 2 * pad);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    phase += (2 * Math.PI * f0(i / FS)) / FS;
    let v = 0;
    for (let h = 1; h <= 10; h++) v += Math.sin(h * phase) / h;
    out[pad + i] = amplitude * v;
  }
  let seed = 1;
  for (let i = 0; i < out.length; i++) {
    seed = (seed * 16807) % 2147483647;
    out[i] += (seed / 2147483647 - 0.5) * 0.0005;
  }
  return out;
}
