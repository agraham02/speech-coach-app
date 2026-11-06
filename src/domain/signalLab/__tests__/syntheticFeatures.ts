import { BREATH, PAUSE, SPEECH, speechMedianDb, syllablePeaks, type AudioFeatures } from "../../dsp/audioFeatures";
import { percentile } from "../../dsp/pitchTracker";
import type { TranscriptWord } from "../../sessionTypes";

// Made-up AudioFeatures for tests: no audio, just the arrays the real
// extractor would produce, built from a list of segments. Every generator is
// deterministic (a seeded random source), so a test sees the same signal
// every run. Not a test file itself (no ".test"), so jest ignores it.

export const SYNTH_HOP_MS = 10;

// A small seeded random source, 0 to 1.
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const hzAfter = (baseHz: number, st: number) => baseHz * 2 ** (st / 12);

export interface Seg {
  ms: number;
  kind?: "speech" | "pause" | "breath";
  // Pitch in Hz, or a function of the time into the segment; absent = unvoiced.
  f0?: number | ((tMs: number) => number);
  // Level in dBFS, or a function of the time into the segment.
  levelDb?: number | ((tMs: number) => number);
}

export interface BuildOptions {
  hopMs?: number;
  offsetMs?: number;
  voicedConfidence?: number;
}

const at = (v: number | ((t: number) => number) | undefined, t: number, fallback: number) => (v === undefined ? fallback : typeof v === "function" ? v(t) : v);

export function buildFeatures(segs: Seg[], opts: BuildOptions = {}): AudioFeatures {
  const hopMs = opts.hopMs ?? SYNTH_HOP_MS;
  const offsetMs = opts.offsetMs ?? 0;
  const conf = opts.voicedConfidence ?? 0.9;
  const f0: number[] = [];
  const level: number[] = [];
  const speech: number[] = [];
  for (const s of segs) {
    const frames = Math.max(1, Math.round(s.ms / hopMs));
    const kind = s.kind ?? "speech";
    for (let j = 0; j < frames; j++) {
      const t = j * hopMs;
      const hz = kind === "pause" ? 0 : at(s.f0, t, 0);
      f0.push(hz > 0 ? hz : 0);
      level.push(at(s.levelDb, t, kind === "pause" ? -70 : -30));
      speech.push(kind === "pause" ? PAUSE : kind === "breath" ? BREATH : SPEECH);
    }
  }
  const levelDb = Float32Array.from(level);
  const speechArr = Uint8Array.from(speech);
  const f0Hz = Float32Array.from(f0);
  const noiseFloorDb = percentile(levelDb, 0.1);
  return {
    version: "synthetic",
    sampleRate: 16000,
    durationMs: f0.length * hopMs,
    hopMs,
    offsetMs,
    f0Hz,
    confidence: Float32Array.from(f0, (v) => (v > 0 ? conf : 0)),
    levelDb,
    speech: speechArr,
    noiseFloorDb,
    peaks: syllablePeaks(levelDb, speechArr, speechMedianDb(levelDb, speechArr, noiseFloorDb)),
  };
}

// A word token is one voiced syllable with a loudness hump (the level falls 10
// dB at each edge, so the real peak finder sees one peak per word). A pause
// token is silence; with heard: false the energy gate is made to miss it: the
// frames stay labelled speech at a low level, as when a breath or room noise
// fills the gap.
export type Token =
  | {
      text: string;
      ms?: number;
      // Pitch: a number, or a function of progress through the word (0 to 1).
      hz?: number | ((u: number) => number);
      db?: number;
    }
  | { pauseMs: number; heard?: boolean };

export interface ReadingOptions {
  // Unvoiced, quiet speech-labelled gap between words with no pause.
  gapMs?: number;
  lead?: number;
  offsetMs?: number;
}

export interface Reading {
  features: AudioFeatures;
  words: TranscriptWord[];
}

const isPause = (t: Token): t is { pauseMs: number; heard?: boolean } => "pauseMs" in t;

export function buildReading(tokens: Token[], opts: ReadingOptions = {}): Reading {
  const gapMs = opts.gapMs ?? 50;
  const lead = opts.lead ?? 200;
  const segs: Seg[] = [{ ms: lead, kind: "pause" }];
  const words: TranscriptWord[] = [];
  let clock = lead;
  for (let k = 0; k < tokens.length; k++) {
    const tok = tokens[k];
    if (isPause(tok)) {
      segs.push(tok.heard === false ? { ms: tok.pauseMs, kind: "speech", levelDb: -42 } : { ms: tok.pauseMs, kind: "pause" });
      clock += tok.pauseMs;
      continue;
    }
    const ms = tok.ms ?? 240;
    const db = tok.db ?? 62;
    const hz = tok.hz ?? 120;
    segs.push({
      ms,
      f0: typeof hz === "number" ? hz : (t) => hz(Math.min(1, t / ms)),
      levelDb: (t) => db - 10 * (1 - Math.sin((Math.PI * Math.min(1, t / ms)))),
    });
    words.push({ text: tok.text, startMs: clock, endMs: clock + ms });
    clock += ms;
    const next = tokens[k + 1];
    if (next && !isPause(next)) {
      segs.push({ ms: gapMs, kind: "speech", levelDb: db - 14 });
      clock += gapMs;
    }
  }
  segs.push({ ms: lead, kind: "pause" });
  return { features: buildFeatures(segs, { offsetMs: opts.offsetMs }), words };
}

// --- Takes for the pitch variety test ---

export interface TakeSpec {
  phrases?: number;
  wordsPerPhrase?: number;
  baseHz?: number;
  // Standard deviation of the pitch inside a phrase, in semitones.
  wanderSt?: number;
  // How far each phrase's centre sits from the last, in semitones (the key
  // changes between phrases without the melody within them getting livelier).
  driftSt?: number;
  pauseMs?: number;
  db?: number;
  seed?: number;
}

// Phrases of words, one pitch per word drawn uniformly around the phrase's
// centre with the given SD. wanderSt 0.3 reads flat, 1.2 normal, 2.2 lively.
export function phraseTake(spec: TakeSpec = {}): Reading {
  const rand = rng(spec.seed ?? 7);
  const phrases = spec.phrases ?? 10;
  const per = spec.wordsPerPhrase ?? 8;
  const tokens: Token[] = [];
  let centre = 0;
  for (let p = 0; p < phrases; p++) {
    centre = p === 0 ? 0 : (rand() * 2 - 1) * (spec.driftSt ?? 0);
    for (let w = 0; w < per; w++) {
      const st = centre + (rand() * 2 - 1) * Math.sqrt(3) * (spec.wanderSt ?? 1);
      tokens.push({ text: `p${p}w${w}`, hz: hzAfter(spec.baseHz ?? 120, st), db: (spec.db ?? 62) + (rand() * 2 - 1) * 1.5 });
    }
    if (p < phrases - 1) tokens.push({ pauseMs: spec.pauseMs ?? 500 });
  }
  return buildReading(tokens);
}

// --- A slow glide on one vowel ---

export interface GlideSpec {
  fromHz?: number;
  toHz?: number;
  seconds?: number;
  // Times (ms into the glide) where the tracker doubles for 30 ms, an octave error.
  octaveErrorsAtMs?: number[];
  // Jitter in semitones.
  jitterSt?: number;
  seed?: number;
}

export function glideFeatures(spec: GlideSpec = {}): AudioFeatures {
  const from = spec.fromHz ?? 110;
  const to = spec.toHz ?? 220;
  const ms = (spec.seconds ?? 10) * 1000;
  const rand = rng(spec.seed ?? 3);
  const errors = spec.octaveErrorsAtMs ?? [];
  return buildFeatures([
    { ms: 300, kind: "pause" },
    {
      ms,
      f0: (t) => {
        const st = (12 * Math.log2(to / from) * t) / ms + (rand() * 2 - 1) * (spec.jitterSt ?? 0.05);
        const hz = hzAfter(from, st);
        return errors.some((e) => t >= e && t < e + 30) ? hz * 2 : hz;
      },
      levelDb: 60,
    },
    { ms: 300, kind: "pause" },
  ]);
}

// --- Sentences with falling and rising endings ---

export type EndingShape = "falling" | "rising" | "flat";

// Five-word sentences, one syllable a word. The last word moves 5 semitones
// down (falling), 4 up (rising) or stays put (flat). Sentences are 600 ms
// apart. `sentenceEndsMs` are the ends of the last words; the last word's text
// carries the punctuation a transcript would.
export function sentenceTake(shapes: EndingShape[]): Reading & { sentenceEndsMs: number[] } {
  const tokens: Token[] = [];
  shapes.forEach((shape, s) => {
    for (let w = 0; w < 4; w++) tokens.push({ text: `s${s}w${w}`, hz: 120 });
    const dir = shape === "falling" ? -5 : shape === "rising" ? 4 : 0;
    tokens.push({ text: `s${s}end${shape === "rising" ? "?" : "."}`, ms: 320, hz: (u) => hzAfter(120, dir * u) });
    if (s < shapes.length - 1) tokens.push({ pauseMs: 600 });
  });
  const reading = buildReading(tokens);
  const sentenceEndsMs = reading.words.filter((_, i) => i % 5 === 4).map((w) => w.endMs);
  return { ...reading, sentenceEndsMs };
}

// --- A spoken sentence with some words stressed ---

export interface StressSpec {
  // Which cues the stressed word gets.
  pitchSt?: number;
  loudDb?: number;
  lengthMult?: number;
}

// Words are 220 ms at 120 Hz and 60 dB, with a small fixed wander. The words at
// `stressed` get the cues in `spec`.
export function stressedSentence(words: string[], stressed: number[], spec: StressSpec = { pitchSt: 3, loudDb: 6, lengthMult: 1.6 }): Reading {
  const rand = rng(11);
  const tokens: Token[] = words.map((text, k) => {
    const on = stressed.includes(k);
    return {
      text,
      ms: Math.round(220 * (on ? (spec.lengthMult ?? 1) : 1)),
      hz: hzAfter(120, (rand() * 2 - 1) * 0.4 + (on ? (spec.pitchSt ?? 0) : 0)),
      db: 60 + (rand() * 2 - 1) * 0.8 + (on ? (spec.loudDb ?? 0) : 0),
    };
  });
  return buildReading(tokens);
}

// --- A passage with pauses after chosen words ---

// `pauses` maps a word index to the pause after it. heard: false makes the
// energy gate miss it (the words still have the gap).
export function pausedReading(words: string[], pauses: Record<number, { ms: number; heard?: boolean }>): Reading {
  const tokens: Token[] = [];
  words.forEach((text, k) => {
    tokens.push({ text, hz: 120 });
    const p = pauses[k];
    if (p) tokens.push({ pauseMs: p.ms, heard: p.heard });
  });
  return buildReading(tokens);
}
