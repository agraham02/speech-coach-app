import type { TranscriptWord } from "../sessionTypes";

// On-device pause detection from the raw waveform (no transcript needed),
// optionally classified using word timestamps. Feeds the Cadence skill and
// the pause drills: deliberate pauses at sentence ends are good; long
// mid-phrase silences are hesitations.

export const PAUSE_MIN_MS = 300;
const FRAME_MS = 20;
const FLOOR_DBFS = -45;
const NOISE_MARGIN_DB = 8;
const HESITATION_MS = 2000;

export type PauseKind = "boundary" | "mid_phrase" | "unknown";

export interface Pause {
  startMs: number;
  endMs: number;
  durationMs: number;
  kind: PauseKind;
  // Index of the last word spoken before the pause, when words are known.
  afterWordIdx: number | null;
}

export interface PauseAnalysis {
  pauses: Pause[];
  speechStartMs: number | null; // time to first word (from the start)
  speechEndMs: number | null;
  speakingRatio: number; // voiced time / time between first and last speech
  pausesPerMinute: number;
  longestPauseMs: number;
  meanPauseMs: number;
  midPhrasePauses: number;
  hesitations: number; // mid-phrase pauses >= 2 s
  // Fraction of sentence endings followed by a real pause (>= 300 ms).
  boundaryPauseRate: number | null;
}

// Per-frame loudness in dBFS.
export function frameLoudness(waveform: Float32Array, sampleRate: number, frameMs = FRAME_MS): number[] {
  const frameSize = Math.max(1, Math.round((sampleRate * frameMs) / 1000));
  const out: number[] = [];
  for (let start = 0; start + frameSize <= waveform.length; start += frameSize) {
    let sum = 0;
    for (let i = start; i < start + frameSize; i++) sum += waveform[i] * waveform[i];
    const rms = Math.sqrt(sum / frameSize);
    out.push(rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100);
  }
  return out;
}

function percentile(values: number[], p: number): number {
  if (!values.length) return -100;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

const SENTENCE_END = /[.!?]["')\]]?$/;

export function detectPauses(
  waveform: Float32Array,
  sampleRate: number,
  words: TranscriptWord[] | null = null,
): PauseAnalysis {
  const loudness = frameLoudness(waveform, sampleRate);
  // Adaptive threshold: a little above the room's noise floor, but never
  // below an absolute floor (a silent room would otherwise make breaths
  // count as speech).
  const threshold = Math.max(FLOOR_DBFS, percentile(loudness, 10) + NOISE_MARGIN_DB);
  const voiced = loudness.map((db) => db > threshold);

  const first = voiced.indexOf(true);
  const last = voiced.lastIndexOf(true);
  if (first === -1) {
    return {
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
    };
  }

  const pauses: Pause[] = [];
  let runStart = -1;
  let voicedFrames = 0;
  for (let i = first; i <= last; i++) {
    if (voiced[i]) {
      voicedFrames += 1;
      if (runStart !== -1) {
        const startMs = runStart * FRAME_MS;
        const endMs = i * FRAME_MS;
        if (endMs - startMs >= PAUSE_MIN_MS) pauses.push(classify(startMs, endMs, words));
        runStart = -1;
      }
    } else if (runStart === -1) {
      runStart = i;
    }
  }

  const speechStartMs = first * FRAME_MS;
  const speechEndMs = (last + 1) * FRAME_MS;
  const spanMs = Math.max(speechEndMs - speechStartMs, FRAME_MS);
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

  return {
    pauses,
    speechStartMs,
    speechEndMs,
    speakingRatio: Math.round(((voicedFrames * FRAME_MS) / spanMs) * 100) / 100,
    pausesPerMinute: Math.round((pauses.length / (spanMs / 60000)) * 10) / 10,
    longestPauseMs: durations.length ? Math.max(...durations) : 0,
    meanPauseMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
    midPhrasePauses: midPhrase.length,
    hesitations: midPhrase.filter((p) => p.durationMs >= HESITATION_MS).length,
    boundaryPauseRate,
  };
}

function classify(startMs: number, endMs: number, words: TranscriptWord[] | null): Pause {
  const base = { startMs, endMs, durationMs: endMs - startMs };
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
