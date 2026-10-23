import type { TranscriptWord } from "../sessionTypes";
import { BREATH, extractAudioFeatures, SPEECH, type AudioFeatures } from "./audioFeatures";

// Pauses from the voice-activity track (audioFeatures.ts: an energy gate
// with hysteresis, breaths tagged), optionally classified using word
// timestamps. Feeds the Cadence skill and the pause drills: deliberate
// pauses at sentence ends are good; long mid-phrase silences are
// hesitations. A breath inside a silence belongs to the pause around it.

export const PAUSE_MIN_MS = 300;
const HESITATION_MS = 2000;

export type PauseKind = "boundary" | "mid_phrase" | "unknown";

export interface Pause {
  startMs: number;
  endMs: number;
  durationMs: number;
  kind: PauseKind;
  // Index of the last word spoken before the pause, when words are known.
  afterWordIdx: number | null;
  // Audible breaths taken inside this pause.
  breaths: number;
}

export interface PauseAnalysis {
  pauses: Pause[];
  speechStartMs: number | null; // time to first speech (from the start)
  speechEndMs: number | null;
  speakingRatio: number; // speech time / time between first and last speech
  pausesPerMinute: number;
  longestPauseMs: number;
  meanPauseMs: number;
  midPhrasePauses: number;
  hesitations: number; // mid-phrase pauses >= 2 s
  // Fraction of sentence endings followed by a real pause (>= 300 ms).
  boundaryPauseRate: number | null;
  // Audible breaths between the first and last speech, and per minute of it.
  breaths: number;
  breathsPerMinute: number;
}

const SENTENCE_END = /[.!?]["')\]]?$/;

const EMPTY: PauseAnalysis = {
  pauses: [],
  speechStartMs: null,
  speechEndMs: null,
  speakingRatio: 0,
  pausesPerMinute: 0,
  longestPauseMs: 0,
  meanPauseMs: 0,
  midPhrasePauses: 0,
  hesitations: 0,
  boundaryPauseRate: null,
  breaths: 0,
  breathsPerMinute: 0,
};

export function pausesFromFeatures(features: Pick<AudioFeatures, "speech" | "hopMs" | "offsetMs">, words: TranscriptWord[] | null = null): PauseAnalysis {
  const { speech, hopMs, offsetMs } = features;
  const at = (i: number) => Math.round(offsetMs - hopMs / 2 + i * hopMs);
  let first = -1;
  let last = -1;
  for (let i = 0; i < speech.length; i++) {
    if (speech[i] === SPEECH) {
      if (first === -1) first = i;
      last = i;
    }
  }
  if (first === -1) return { ...EMPTY };

  const pauses: Pause[] = [];
  let speechFrames = 0;
  let breaths = 0;
  let runStart = -1;
  let runBreaths = 0;
  for (let i = first; i <= last; i++) {
    const label = speech[i];
    if (label === SPEECH) {
      speechFrames += 1;
      if (runStart !== -1) {
        const startMs = at(runStart);
        const endMs = at(i);
        if (endMs - startMs >= PAUSE_MIN_MS) pauses.push(classify(startMs, endMs, runBreaths, words));
        runStart = -1;
      }
    } else {
      if (runStart === -1) {
        runStart = i;
        runBreaths = 0;
      }
      if (label === BREATH && speech[i - 1] !== BREATH) {
        runBreaths += 1;
        breaths += 1;
      }
    }
  }

  const speechStartMs = at(first);
  const speechEndMs = at(last + 1);
  const spanMs = Math.max(speechEndMs - speechStartMs, hopMs);
  const durations = pauses.map((p) => p.durationMs);
  const midPhrase = pauses.filter((p) => p.kind === "mid_phrase");

  let boundaryPauseRate: number | null = null;
  if (words && words.length > 1) {
    const sentenceEnds = words.slice(0, -1).filter((w) => SENTENCE_END.test(w.text.trim()));
    if (sentenceEnds.length > 0) {
      const followed = sentenceEnds.filter((w) => pauses.some((p) => p.startMs >= w.endMs - 120 && p.startMs <= w.endMs + 400));
      boundaryPauseRate = Math.round((followed.length / sentenceEnds.length) * 100) / 100;
    }
  }

  const minutes = spanMs / 60000;
  return {
    pauses,
    speechStartMs,
    speechEndMs,
    speakingRatio: Math.round(((speechFrames * hopMs) / spanMs) * 100) / 100,
    pausesPerMinute: Math.round((pauses.length / minutes) * 10) / 10,
    longestPauseMs: durations.length ? Math.max(...durations) : 0,
    meanPauseMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
    midPhrasePauses: midPhrase.length,
    hesitations: midPhrase.filter((p) => p.durationMs >= HESITATION_MS).length,
    boundaryPauseRate,
    breaths,
    breathsPerMinute: Math.round((breaths / minutes) * 10) / 10,
  };
}

// Straight from a waveform (tests, labs). The pipeline extracts features
// once and calls pausesFromFeatures.
export function detectPauses(waveform: Float32Array, sampleRate: number, words: TranscriptWord[] | null = null): PauseAnalysis {
  return pausesFromFeatures(extractAudioFeatures(waveform, sampleRate), words);
}

function classify(startMs: number, endMs: number, breaths: number, words: TranscriptWord[] | null): Pause {
  const base = { startMs, endMs, durationMs: endMs - startMs, breaths };
  if (!words || words.length === 0) return { ...base, kind: "unknown", afterWordIdx: null };
  let afterWordIdx: number | null = null;
  for (let i = 0; i < words.length; i++) {
    if (words[i].endMs <= startMs + 150) afterWordIdx = i;
    else break;
  }
  if (afterWordIdx === null) return { ...base, kind: "unknown", afterWordIdx };
  const kind: PauseKind = SENTENCE_END.test(words[afterWordIdx].text.trim()) ? "boundary" : "mid_phrase";
  return { ...base, kind, afterWordIdx };
}
