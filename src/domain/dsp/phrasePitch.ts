import { SPEECH, type AudioFeatures } from "./audioFeatures";
import { cleanPitch, semitonesBetween, type CleanPitchOptions, type PitchCleanupCounts } from "./pitchCleanup";
import { percentile } from "./pitchTracker";

// A candidate melody measure for Signal Lab (docs/overhaul/PLAN.md, section
// 6.5, "Melody score"): pitch variation within each phrase, in semitones
// from that phrase's own median, instead of one range over the whole take.
// A few outlying frames, or a change of key between phrases, then cannot
// inflate the number. Listeners' liveliness ratings track variation within
// phrases (Hincks).

type Track = Pick<AudioFeatures, "f0Hz" | "confidence" | "speech" | "hopMs" | "offsetMs">;

export const PHRASE_PAUSE_MS = 300;
export const PHRASE_MIN_VOICED_FRAMES = 15;

export interface PhraseSpan {
  // Frame indices, inclusive.
  firstFrame: number;
  lastFrame: number;
  startMs: number;
  endMs: number;
}

// Time at the left edge of frame i (the same convention as pauses.ts).
const edgeMs = (f: Pick<AudioFeatures, "hopMs" | "offsetMs">, i: number) => Math.round(f.offsetMs - f.hopMs / 2 + i * f.hopMs);

// Phrases: runs of speech frames, split wherever the frames between two
// speech frames (pause or breath) last `minPauseMs` or longer. A shorter gap
// is part of the phrase.
export function splitPhrases(f: Pick<AudioFeatures, "speech" | "hopMs" | "offsetMs">, minPauseMs = PHRASE_PAUSE_MS): PhraseSpan[] {
  const out: PhraseSpan[] = [];
  const gapFrames = Math.max(1, Math.ceil(minPauseMs / f.hopMs));
  let first = -1;
  let last = -1;
  const close = () => {
    if (first !== -1) out.push({ firstFrame: first, lastFrame: last, startMs: edgeMs(f, first), endMs: edgeMs(f, last + 1) });
    first = -1;
  };
  for (let i = 0; i < f.speech.length; i++) {
    if (f.speech[i] !== SPEECH) continue;
    if (first !== -1 && i - last - 1 >= gapFrames) close();
    if (first === -1) first = i;
    last = i;
  }
  close();
  return out;
}

export interface PhraseVariation {
  startMs: number;
  endMs: number;
  voicedFrames: number;
  medianHz: number;
  // Standard deviation of the phrase's pitch in semitones from its median.
  sdSt: number;
  // p90 minus p10 in semitones, the same definition as today's range.
  rangeSt: number;
}

export interface PhrasePitchOptions {
  minPauseMs?: number;
  minVoicedFrames?: number;
  // Passed to cleanPitch.
  cleanup?: CleanPitchOptions;
  // false: skip cleanPitch and use the tracker's pitch as it is.
  clean?: boolean;
}

export interface PhrasePitchResult {
  phrases: PhraseVariation[];
  totalPhrases: number;
  usablePhrases: number;
  // Mean of the phrases' SDs, each weighted by its voiced frames. null when no phrase is usable.
  weightedMeanSdSt: number | null;
  medianSdSt: number | null;
  // Same two for the p90-p10 range.
  weightedMeanRangeSt: number | null;
  cleanup: PitchCleanupCounts | null;
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export function phrasePitchVariation(features: Track, opts: PhrasePitchOptions = {}): PhrasePitchResult {
  const minVoiced = opts.minVoicedFrames ?? PHRASE_MIN_VOICED_FRAMES;
  const cleaned = opts.clean === false ? null : cleanPitch(features.f0Hz, features.confidence, opts.cleanup);
  const f0 = cleaned ? cleaned.f0Hz : features.f0Hz;
  const spans = splitPhrases(features, opts.minPauseMs ?? PHRASE_PAUSE_MS);

  const phrases: PhraseVariation[] = [];
  for (const span of spans) {
    const hz: number[] = [];
    for (let i = span.firstFrame; i <= span.lastFrame; i++) if (f0[i] > 0) hz.push(f0[i]);
    if (hz.length < minVoiced) continue;
    const med = percentile(hz, 0.5);
    const st = hz.map((v) => semitonesBetween(v, med));
    const mean = st.reduce((a, b) => a + b, 0) / st.length;
    const sd = Math.sqrt(st.reduce((a, b) => a + (b - mean) ** 2, 0) / st.length);
    phrases.push({
      startMs: span.startMs,
      endMs: span.endMs,
      voicedFrames: hz.length,
      medianHz: round(med, 1),
      sdSt: round(sd),
      rangeSt: round(percentile(st, 0.9) - percentile(st, 0.1)),
    });
  }

  const frames = phrases.reduce((a, p) => a + p.voicedFrames, 0);
  return {
    phrases,
    totalPhrases: spans.length,
    usablePhrases: phrases.length,
    weightedMeanSdSt: frames ? round(phrases.reduce((a, p) => a + p.sdSt * p.voicedFrames, 0) / frames) : null,
    medianSdSt: phrases.length ? round(percentile(phrases.map((p) => p.sdSt), 0.5)) : null,
    weightedMeanRangeSt: frames ? round(phrases.reduce((a, p) => a + p.rangeSt * p.voicedFrames, 0) / frames) : null,
    cleanup: cleaned ? cleaned.counts : null,
  };
}
