import { SPEECH, type AudioFeatures } from "../dsp/audioFeatures";
import { percentile, summarizePitch } from "../dsp/pitchTracker";
import type { PauseAnalysis } from "../dsp/pauses";
import { contentWordKey } from "../dsp/volumePauses";
import type { TranscriptWord } from "../sessionTypes";
import { centsToHz, hzToCents, packInt16, packUint32, packUint8, unpackInt16, unpackUint32, unpackUint8 } from "./pack";
import type { AudioTrack, Extractor, LoudnessStats, PauseStats, PitchStats, ProsodyStats, RateStats } from "./types";

// Summaries of the audio track: the numbers scores and the reviewer read,
// the 200 ms series the current chart draws, and the chart data for the new
// one. Pure; all of it runs on the stored track, so it can be recomputed
// after the media is gone.

// --- Packing ---

export function packAudioFeatures(f: AudioFeatures, run: Pick<Extractor, "thread" | "elapsedMs">): AudioTrack {
  return {
    extractor: { name: "yin-dense+energy-vad", version: f.version, ...run },
    sampleRate: f.sampleRate,
    hopMs: f.hopMs,
    offsetMs: f.offsetMs,
    frames: f.f0Hz.length,
    f0Cents: packInt16(Array.from(f.f0Hz, hzToCents)),
    f0Confidence: packUint8(Array.from(f.confidence, (c) => c * 255)),
    levelCdB: packInt16(Array.from(f.levelDb, (db) => db * 100)),
    speech: packUint8(f.speech),
    peaks: packUint32(f.peaks),
    noiseFloorDb: Math.round(f.noiseFloorDb * 10) / 10,
  };
}

export function unpackAudioTrack(t: AudioTrack, durationMs: number): AudioFeatures {
  const cents = unpackInt16(t.f0Cents);
  const conf = unpackUint8(t.f0Confidence);
  const level = unpackInt16(t.levelCdB);
  return {
    version: t.extractor.version,
    sampleRate: t.sampleRate,
    durationMs,
    hopMs: t.hopMs,
    offsetMs: t.offsetMs,
    f0Hz: Float32Array.from(cents, centsToHz),
    confidence: Float32Array.from(conf, (c) => c / 255),
    levelDb: Float32Array.from(level, (c) => c / 100),
    speech: unpackUint8(t.speech),
    noiseFloorDb: t.noiseFloorDb,
    peaks: Int32Array.from(unpackUint32(t.peaks)),
  };
}

// --- Helpers ---

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const frameAt = (f: Pick<AudioFeatures, "hopMs" | "offsetMs">, ms: number) => Math.round((ms - f.offsetMs) / f.hopMs);
const timeOf = (f: Pick<AudioFeatures, "hopMs" | "offsetMs">, i: number) => f.offsetMs + i * f.hopMs;

function sd(values: number[]): number {
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length);
}

// 50 ms power average of the frame levels (5 frames).
function smooth50(levels: Float32Array): Float32Array {
  const out = new Float32Array(levels.length);
  for (let i = 0; i < levels.length; i++) {
    let p = 0;
    let c = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(levels.length - 1, i + 2); j++) {
      p += Math.pow(10, levels[j] / 10);
      c++;
    }
    out[i] = 10 * Math.log10(Math.max(p / c, 1e-12));
  }
  return out;
}

function speechMedian(f: AudioFeatures): number | null {
  const vals: number[] = [];
  for (let i = 0; i < f.levelDb.length; i++) if (f.speech[i] === SPEECH) vals.push(f.levelDb[i]);
  return vals.length ? percentile(vals, 0.5) : null;
}

// Syllables in a written word: vowel groups, a silent final "e" taken off,
// at least one. Digits count one each. Close enough for a rate.
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!w) return 0;
  if (/^[0-9]+$/.test(w)) return w.length;
  const letters = w.replace(/[0-9]/g, "");
  let groups = (letters.match(/[aeiouy]+/g) ?? []).length;
  if (letters.length > 2 && letters.endsWith("e") && !letters.endsWith("le") && !/[aeiouy]e$/.test(letters)) groups -= 1;
  return Math.max(1, groups);
}

const SENTENCE_END = /[.!?]["')\]]?$/;
const STATEMENT_END = /[.!]["')\]]?$/;
const HESITATION = /^(um+|uhm+|uh+|erm?|ah+|hmm+)$/;
const bare = (w: TranscriptWord) => w.text.toLowerCase().replace(/[^a-z']/g, "");

// --- Pitch ---

// Pitch range is only scored from this much voiced speech, and flagged as
// low confidence under the second number (see quality reasons).
export const PITCH_MIN_VOICED_SECONDS = 8;
export const PITCH_SOLID_VOICED_SECONDS = 20;
export const MIN_SNR_DB = 12;

export function pitchStatsOf(f: AudioFeatures): PitchStats | null {
  let speechFrames = 0;
  let voiced = 0;
  for (let i = 0; i < f.f0Hz.length; i++) {
    if (f.speech[i] === SPEECH) speechFrames++;
    if (f.f0Hz[i] > 0) voiced++;
  }
  if (!speechFrames) return null;
  const s = summarizePitch(f);
  return {
    voicedSeconds: round((voiced * f.hopMs) / 1000),
    voicedShare: round(voiced / speechFrames, 2),
    medianHz: s.medianHz,
    sdSemitones: s.sdSemitones,
    rangeSemitones: s.rangeSemitones,
    meanConfidence: s.meanConfidence,
  };
}

// --- Loudness ---

export function loudnessStatsOf(f: AudioFeatures): LoudnessStats | null {
  const med = speechMedian(f);
  if (med === null) return null;
  const sm = smooth50(f.levelDb);
  const speech: number[] = [];
  for (let i = 0; i < sm.length; i++) if (f.speech[i] === SPEECH) speech.push(sm[i]);
  if (speech.length < 50) return null;
  const smMed = percentile(speech, 0.5);
  const peakLevels = Array.from(f.peaks, (i) => sm[i]).filter((v) => v > smMed - 12);
  return {
    speechMedianDbfs: round(smMed),
    spreadDb: round(percentile(speech, 0.9) - percentile(speech, 0.1)),
    syllablePeakSdDb: peakLevels.length > 4 ? round(sd(peakLevels), 2) : null,
    snrDb: round(smMed - f.noiseFloorDb),
  };
}

// --- Pauses ---

export function pauseStatsOf(p: PauseAnalysis): PauseStats {
  return {
    count: p.pauses.length,
    perMinute: p.pausesPerMinute,
    meanMs: p.meanPauseMs,
    longestMs: p.longestPauseMs,
    boundaryRate: p.boundaryPauseRate,
    midPhrase: p.midPhrasePauses,
    hesitations: p.hesitations,
    breaths: p.breaths,
    breathsPerMinute: p.breathsPerMinute,
  };
}

// --- Rate ---

// Words a minute over the speaking span: leading and trailing silence don't
// slow the number down.
export function speakingWpm(words: TranscriptWord[] | null): number | null {
  if (!words || words.length < 2) return null;
  const span = words[words.length - 1].endMs - words[0].startMs;
  if (span < 3000) return null;
  return Math.round(words.length / (span / 60000));
}

export function rateStatsOf(words: TranscriptWord[] | null, pauses: PauseAnalysis | null): RateStats | null {
  const wpm = speakingWpm(words);
  if (!words || wpm === null) return null;
  const start = words[0].startMs;
  const end = words[words.length - 1].endMs;
  const inSpan = (pauses?.pauses ?? []).filter((p) => p.startMs >= start && p.endMs <= end);
  const pausedMs = inSpan.reduce((a, p) => a + p.durationMs, 0);
  const phonationMs = end - start - pausedMs;
  const syllables = words.reduce((a, w) => a + countSyllables(w.text), 0);
  const articulation = phonationMs > 2000 ? syllables / (phonationMs / 1000) : null;

  // Phrases: runs of words between pauses (or word gaps of 300 ms or more).
  const phrases: TranscriptWord[][] = [];
  let current: TranscriptWord[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (current.length) {
      const prev = current[current.length - 1];
      const gap = w.startMs - prev.endMs >= 300 || inSpan.some((p) => p.startMs >= prev.endMs - 150 && p.endMs <= w.startMs + 150);
      if (gap) {
        phrases.push(current);
        current = [];
      }
    }
    current.push(w);
  }
  if (current.length) phrases.push(current);
  const phraseRates = phrases
    .filter((p) => p.length >= 4 && p[p.length - 1].endMs - p[0].startMs >= 1000)
    .map((p) => p.reduce((a, w) => a + countSyllables(w.text), 0) / ((p[p.length - 1].endMs - p[0].startMs) / 1000));

  // Second half against the first, by time.
  const mid = (start + end) / 2;
  const half = (ws: TranscriptWord[]) => {
    if (ws.length < 8) return null;
    const a = ws[0].startMs;
    const b = ws[ws.length - 1].endMs;
    const paused = inSpan.filter((p) => p.startMs >= a && p.endMs <= b).reduce((s, p) => s + p.durationMs, 0);
    const ms = b - a - paused;
    return ms > 1000 ? ws.reduce((s, w) => s + countSyllables(w.text), 0) / (ms / 1000) : null;
  };
  const first = half(words.filter((w) => w.endMs <= mid));
  const second = half(words.filter((w) => w.startMs >= mid));

  return {
    speakingWpm: wpm,
    articulationSylPerSec: articulation !== null ? round(articulation, 2) : null,
    paceSdSylPerSec: phraseRates.length >= 3 ? round(sd(phraseRates), 2) : null,
    paceDriftPercent: first && second ? Math.round(((second - first) / first) * 100) : null,
  };
}

// --- Prosody: emphasis, uptalk, trailing off, missed fillers ---

const UPTALK_WINDOW_MS = 300;
const UPTALK_RISE_ST = 2.5;
const TRAILING_DROP_DB = 6;

function slopeSemitones(f: AudioFeatures, fromMs: number, toMs: number, refHz: number): number | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = Math.max(0, frameAt(f, fromMs)); i <= Math.min(f.f0Hz.length - 1, frameAt(f, toMs)); i++) {
    if (f.f0Hz[i] > 0) {
      xs.push(timeOf(f, i) / 1000);
      ys.push(12 * Math.log2(f.f0Hz[i] / refHz));
    }
  }
  if (xs.length < 8) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let k = 0; k < xs.length; k++) {
    num += (xs[k] - mx) * (ys[k] - my);
    den += (xs[k] - mx) ** 2;
  }
  return den > 0 ? num / den : null;
}

function meanSpeechLevel(f: AudioFeatures, fromMs: number, toMs: number): number | null {
  let p = 0;
  let c = 0;
  for (let i = Math.max(0, frameAt(f, fromMs)); i <= Math.min(f.levelDb.length - 1, frameAt(f, toMs)); i++) {
    if (f.speech[i] !== SPEECH) continue;
    p += Math.pow(10, f.levelDb[i] / 10);
    c++;
  }
  return c >= 3 ? 10 * Math.log10(p / c) : null;
}

export function prosodyStatsOf(f: AudioFeatures, words: TranscriptWord[] | null): ProsodyStats {
  const med = speechMedian(f);
  const medianHz = summarizePitch(f).medianHz;
  const out: ProsodyStats = { emphasis: null, uptalk: null, trailingOff: null, possibleMissedFillers: { count: 0, atMs: [] } };
  if (!words || words.length < 3 || med === null) return out;

  // Emphasis: strong syllable peaks (3 dB or more over the speaking level),
  // and how many land on content words rather than "the", "and", "um".
  const sm = smooth50(f.levelDb);
  let strong = 0;
  let onWords = 0;
  let onContent = 0;
  for (const i of Array.from(f.peaks)) {
    if (sm[i] < med + 3) continue;
    strong++;
    const t = timeOf(f, i);
    const word = words.find((w) => w.startMs - 40 <= t && t <= w.endMs + 40);
    if (!word) continue;
    onWords++;
    if (contentWordKey(word.text)) onContent++;
  }
  out.emphasis = { strongPeaks: strong, onContentWords: onWords >= 5 ? round(onContent / onWords, 2) : null };

  // Sentences.
  const sentences: TranscriptWord[][] = [];
  let cur: TranscriptWord[] = [];
  for (const w of words) {
    cur.push(w);
    if (SENTENCE_END.test(w.text.trim())) {
      sentences.push(cur);
      cur = [];
    }
  }

  if (medianHz) {
    let statements = 0;
    let rising = 0;
    for (const s of sentences) {
      const last = s[s.length - 1];
      if (s.length < 3 || !STATEMENT_END.test(last.text.trim())) continue;
      const slope = slopeSemitones(f, last.endMs - UPTALK_WINDOW_MS, last.endMs, medianHz);
      if (slope === null) continue;
      statements++;
      if (slope * (UPTALK_WINDOW_MS / 1000) >= UPTALK_RISE_ST) rising++;
    }
    out.uptalk = { statements, rising };
  }

  let measured = 0;
  let trailing = 0;
  for (const s of sentences) {
    if (s.length < 4) continue;
    const whole = meanSpeechLevel(f, s[0].startMs, s[s.length - 1].endMs);
    const last = meanSpeechLevel(f, s[s.length - 1].startMs, s[s.length - 1].endMs);
    if (whole === null || last === null) continue;
    measured++;
    if (last <= whole - TRAILING_DROP_DB) trailing++;
  }
  out.trailingOff = { sentences: measured, trailing };

  // A voiced, flat stretch of 200 ms or more with no word over it, between
  // two words neither of which is already an um.
  if (medianHz) {
    for (let k = 0; k + 1 < words.length; k++) {
      const a = words[k];
      const b = words[k + 1];
      if (b.startMs - a.endMs < 250 || HESITATION.test(bare(a)) || HESITATION.test(bare(b))) continue;
      let runStart = -1;
      for (let i = Math.max(0, frameAt(f, a.endMs + 40)); i <= Math.min(f.f0Hz.length - 1, frameAt(f, b.startMs - 40)) + 1; i++) {
        const voiced = i < f.f0Hz.length && i <= frameAt(f, b.startMs - 40) && f.f0Hz[i] > 0 && f.speech[i] === SPEECH;
        if (voiced && runStart === -1) runStart = i;
        if (!voiced && runStart !== -1) {
          const len = i - runStart;
          if (len * f.hopMs >= 200) {
            const st = Array.from(f.f0Hz.subarray(runStart, i), (hz) => 12 * Math.log2(hz / medianHz));
            if (sd(st) < 0.75) {
              out.possibleMissedFillers.count++;
              out.possibleMissedFillers.atMs.push(Math.round(timeOf(f, runStart)));
            }
          }
          runStart = -1;
        }
      }
    }
  }
  return out;
}

// --- Series ---

// What the current chart and Move It read: one value per 200 ms bucket.
// Pitch is the median of the bucket's voiced frames (null under 3 of them);
// volume is the bucket's power-mean level, floored at -60 dBFS.
export function bucketSeries(f: AudioFeatures, bucketMs = 200): { pitchContourHz: (number | null)[]; volumeEnvelopeDbfs: number[] } {
  const buckets = Math.ceil(f.durationMs / bucketMs);
  const pitchContourHz: (number | null)[] = [];
  const volumeEnvelopeDbfs: number[] = [];
  for (let b = 0; b < buckets; b++) {
    const from = Math.max(0, frameAt(f, b * bucketMs));
    const to = Math.min(f.f0Hz.length - 1, frameAt(f, (b + 1) * bucketMs) - 1);
    const voiced: number[] = [];
    let p = 0;
    let c = 0;
    for (let i = from; i <= to; i++) {
      if (f.f0Hz[i] > 0) voiced.push(f.f0Hz[i]);
      p += Math.pow(10, f.levelDb[i] / 10);
      c++;
    }
    pitchContourHz.push(voiced.length >= 3 ? round(percentile(voiced, 0.5)) : null);
    volumeEnvelopeDbfs.push(c ? round(Math.max(-60, 10 * Math.log10(Math.max(p / c, 1e-12)))) : -60);
  }
  return { pitchContourHz, volumeEnvelopeDbfs };
}

export interface VoiceChartData {
  // False when there's too little voice to draw a meaningful pitch line:
  // show "not enough voice to chart" instead of a line on the floor.
  enoughVoice: boolean;
  medianHz: number | null;
  bucketMs: number;
  // Bucket start times.
  tMs: number[];
  // Semitones from the speaker's median; null = a gap (pause or unvoiced),
  // to be drawn as a gap, never as 0.
  pitchSt: (number | null)[];
  // Speaking loudness relative to the median speaking level (dB); null in pauses.
  levelDb: (number | null)[];
}

export const CHART_MIN_VOICED_SECONDS = 3;

// Chart data at most `maxPoints` wide, so the chart fits the screen width
// instead of scrolling.
export function voiceChartData(f: AudioFeatures, maxPoints = 300): VoiceChartData {
  const pitch = summarizePitch(f);
  const med = speechMedian(f);
  const bucketMs = Math.max(f.hopMs, Math.ceil(f.durationMs / Math.max(1, maxPoints) / 10) * 10);
  const buckets = Math.ceil(f.durationMs / bucketMs);
  let voicedFrames = 0;
  for (let i = 0; i < f.f0Hz.length; i++) if (f.f0Hz[i] > 0) voicedFrames++;
  const enoughVoice = pitch.medianHz != null && (voicedFrames * f.hopMs) / 1000 >= CHART_MIN_VOICED_SECONDS;
  const tMs: number[] = [];
  const pitchSt: (number | null)[] = [];
  const levelDb: (number | null)[] = [];
  for (let b = 0; b < buckets; b++) {
    tMs.push(b * bucketMs);
    const from = Math.max(0, frameAt(f, b * bucketMs));
    const to = Math.min(f.f0Hz.length - 1, frameAt(f, (b + 1) * bucketMs) - 1);
    const voiced: number[] = [];
    let p = 0;
    let speech = 0;
    let frames = 0;
    for (let i = from; i <= to; i++) {
      frames++;
      if (f.f0Hz[i] > 0) voiced.push(f.f0Hz[i]);
      if (f.speech[i] === SPEECH) {
        speech++;
        p += Math.pow(10, f.levelDb[i] / 10);
      }
    }
    const minVoiced = Math.max(1, Math.min(2, frames));
    pitchSt.push(enoughVoice && pitch.medianHz && voiced.length >= minVoiced ? round(12 * Math.log2(percentile(voiced, 0.5) / pitch.medianHz), 2) : null);
    levelDb.push(med !== null && frames > 0 && speech / frames >= 0.3 ? round(10 * Math.log10(p / speech) - med) : null);
  }
  return { enoughVoice, medianHz: pitch.medianHz, bucketMs, tMs, pitchSt, levelDb };
}

// Reasons the audio numbers should be read with care.
export function audioQualityReasons(pitch: PitchStats | null, loudness: LoudnessStats | null): string[] {
  const out: string[] = [];
  if (!pitch || pitch.voicedSeconds < PITCH_SOLID_VOICED_SECONDS) out.push("few voiced seconds");
  if (loudness && loudness.snrDb < MIN_SNR_DB) out.push("noisy");
  return out;
}

// Pitch range is scored only from enough clear voice.
export function pitchRangeScorable(pitch: PitchStats | null, loudness: LoudnessStats | null): boolean {
  return !!pitch && pitch.rangeSemitones != null && pitch.voicedSeconds >= PITCH_MIN_VOICED_SECONDS && (!loudness || loudness.snrDb >= MIN_SNR_DB);
}

