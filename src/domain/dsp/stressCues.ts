import { isStopword } from "../conversation/text";
import { normalizeWord } from "../speech/normalize";
import type { TranscriptWord } from "../sessionTypes";
import { SPEECH, type AudioFeatures } from "./audioFeatures";
import { cleanPitch, semitonesBetween } from "./pitchCleanup";
import { splitPhrases } from "./phrasePitch";
import { percentile } from "./pitchTracker";

// A candidate emphasis measure for Signal Lab (docs/overhaul/PLAN.md, section
// 6.5, "Emphasis"). Today's emphasis reads loudness alone, which a phone's
// gain control flattens. People mark a stressed syllable with pitch, loudness
// and length together (Tamburini; Johnson & Kang 2015; Streefkerk 1998), so
// each syllable peak is scored from all three:
//   pitch   semitones above the median pitch of the phrase it sits in
//   loud    dB above the median speaking level within 250 ms either side
//   length  ms of the voiced run it sits in (gaps of up to 2 frames bridged)
// Each cue is z-scored across the peaks of the take, so the three are on one
// scale and no take needs a fixed threshold. A peak with no reading for a cue
// (no voiced frame near it) scores 0 on it, the take's average. The combined
// score is the mean of the three z scores, and it picks which peaks are strong.
//
// How far the strong peaks stand out is measured in real units, not z scores.
// A z score rescales every take to the same spread, so it can't see one take
// reaching further than another: on a real phone, stressing key words took the
// peak spread up 2.3 dB and the z-score gap barely moved (1.18 to 1.37).

type Track = Pick<AudioFeatures, "f0Hz" | "confidence" | "levelDb" | "speech" | "peaks" | "hopMs" | "offsetMs">;

export const STRESS = {
  // Voiced frames each side of a peak used for its pitch.
  pitchHalfFrames: 5,
  // Frames each side used for the local median level (250 ms).
  levelHalfFrames: 25,
  // How far a peak may sit from a voiced frame and still have a run.
  runSearchFrames: 3,
  // Voiced gaps of this many frames or fewer do not end a run.
  runBridgeFrames: 2,
  // Share of peaks called strong.
  topShare: 0.2,
  // Peaks needed before a take can be scored at all.
  minPeaks: 5,
  // Strong peaks that must land on a word before the content share is reported.
  minWordPeaks: 3,
  // A peak belongs to a word when it falls within this of the word's times.
  wordSlackMs: 40,
  // A clear step up in each cue, so the three can be averaged in standOut.
  stepUp: { pitchSt: 2, loudDb: 3, lengthMs: 100 },
} as const;

export interface PeakScore {
  frame: number;
  tMs: number;
  // Raw cues; null when the peak had nothing to read.
  pitchSt: number | null;
  loudDb: number | null;
  lengthMs: number | null;
  // Smoothed level at the peak (dBFS), for loudness-only comparisons.
  levelDb: number;
  zPitch: number;
  zLoud: number;
  zLength: number;
  score: number;
  strong: boolean;
  // Index into the words given, when words were given and one covers the peak.
  wordIndex: number | null;
}

export interface StressResult {
  peaks: PeakScore[];
  // How far the strong peaks (the top 20%) sit above the rest, in clear steps
  // up (STRESS.stepUp), averaged over the cues that could be read.
  standOut: number | null;
  // The same gap in each cue's own units.
  standOutCues: { pitchSt: number | null; loudDb: number | null; lengthMs: number | null };
  strongPeaks: number;
  // Strong peaks that fall on a word, and the share of those on content words.
  strongOnWords: number;
  contentShare: number | null;
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

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

// Mean of the strong peaks minus the mean of the rest, on the peaks with a reading.
function gapOf(values: (number | null)[], strong: Set<number>): number | null {
  const top: number[] = [];
  const rest: number[] = [];
  values.forEach((v, k) => {
    if (v !== null) (strong.has(k) ? top : rest).push(v);
  });
  return top.length && rest.length ? mean(top) - mean(rest) : null;
}

// z scores of the non-null entries; null entries come out 0.
function zScores(values: (number | null)[]): number[] {
  const real = values.filter((v): v is number => v !== null);
  if (real.length < 2) return values.map(() => 0);
  const m = mean(real);
  const sd = Math.sqrt(mean(real.map((v) => (v - m) ** 2)));
  return values.map((v) => (v === null || sd < 1e-6 ? 0 : (v - m) / sd));
}

function voicedRunMs(f0: Float32Array, frame: number, hopMs: number): number | null {
  let seed = -1;
  for (let d = 0; d <= STRESS.runSearchFrames && seed === -1; d++) {
    if (frame - d >= 0 && f0[frame - d] > 0) seed = frame - d;
    else if (frame + d < f0.length && f0[frame + d] > 0) seed = frame + d;
  }
  if (seed === -1) return null;
  const reach = STRESS.runBridgeFrames + 1;
  let left = seed;
  for (let i = seed - 1, gap = 0; i >= 0 && gap < reach; i--) {
    if (f0[i] > 0) {
      left = i;
      gap = 0;
    } else gap++;
  }
  let right = seed;
  for (let i = seed + 1, gap = 0; i < f0.length && gap < reach; i++) {
    if (f0[i] > 0) {
      right = i;
      gap = 0;
    } else gap++;
  }
  return (right - left + 1) * hopMs;
}

function wordAt(words: TranscriptWord[], tMs: number): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    if (tMs < w.startMs - STRESS.wordSlackMs || tMs > w.endMs + STRESS.wordSlackMs) continue;
    const dist = Math.abs(tMs - (w.startMs + w.endMs) / 2);
    if (dist < bestDist) {
      best = k;
      bestDist = dist;
    }
  }
  return best;
}

export function scoreSyllablePeaks(features: Track, words?: TranscriptWord[] | null): StressResult {
  const { hopMs, offsetMs, peaks } = features;
  const n = features.f0Hz.length;
  const f0 = cleanPitch(features.f0Hz, features.confidence).f0Hz;
  const sm = smooth50(features.levelDb);
  const spans = splitPhrases(features);

  const takeHz: number[] = [];
  for (let i = 0; i < n; i++) if (f0[i] > 0) takeHz.push(f0[i]);
  const takeMedian = takeHz.length ? percentile(takeHz, 0.5) : null;
  const phraseMedian = spans.map((s) => {
    const hz: number[] = [];
    for (let i = s.firstFrame; i <= s.lastFrame; i++) if (f0[i] > 0) hz.push(f0[i]);
    return hz.length >= 5 ? percentile(hz, 0.5) : takeMedian;
  });

  const frames = Array.from(peaks);
  const raw = frames.map((p) => {
    const spanIdx = spans.findIndex((s) => p >= s.firstFrame && p <= s.lastFrame);
    const ref = spanIdx >= 0 ? phraseMedian[spanIdx] : takeMedian;
    const hz: number[] = [];
    for (let i = Math.max(0, p - STRESS.pitchHalfFrames); i <= Math.min(n - 1, p + STRESS.pitchHalfFrames); i++) if (f0[i] > 0) hz.push(f0[i]);
    const pitchSt = ref && hz.length ? semitonesBetween(percentile(hz, 0.5), ref) : null;

    const near: number[] = [];
    for (let i = Math.max(0, p - STRESS.levelHalfFrames); i <= Math.min(n - 1, p + STRESS.levelHalfFrames); i++) if (features.speech[i] === SPEECH) near.push(sm[i]);
    const loudDb = near.length >= 5 ? sm[p] - percentile(near, 0.5) : null;

    return { pitchSt, loudDb, lengthMs: voicedRunMs(f0, p, hopMs) };
  });

  const zP = zScores(raw.map((r) => r.pitchSt));
  const zL = zScores(raw.map((r) => r.loudDb));
  const zD = zScores(raw.map((r) => r.lengthMs));
  const scores = frames.map((_, k) => (zP[k] + zL[k] + zD[k]) / 3);

  const enough = frames.length >= STRESS.minPeaks;
  const strongCount = enough ? Math.min(frames.length - 1, Math.ceil(frames.length * STRESS.topShare)) : 0;
  const order = frames.map((_, k) => k).sort((a, b) => scores[b] - scores[a]);
  const strongSet = new Set(order.slice(0, strongCount));

  const scored: PeakScore[] = frames.map((p, k) => {
    const tMs = offsetMs + p * hopMs;
    return {
      frame: p,
      tMs,
      pitchSt: raw[k].pitchSt === null ? null : round(raw[k].pitchSt),
      loudDb: raw[k].loudDb === null ? null : round(raw[k].loudDb),
      lengthMs: raw[k].lengthMs,
      levelDb: round(sm[p]),
      zPitch: round(zP[k]),
      zLoud: round(zL[k]),
      zLength: round(zD[k]),
      score: round(scores[k]),
      strong: strongSet.has(k),
      wordIndex: words ? wordAt(words, tMs) : null,
    };
  });

  let standOut: number | null = null;
  const standOutCues: StressResult["standOutCues"] = { pitchSt: null, loudDb: null, lengthMs: null };
  if (enough && strongCount > 0) {
    const pitch = gapOf(raw.map((r) => r.pitchSt), strongSet);
    const loud = gapOf(raw.map((r) => r.loudDb), strongSet);
    const length = gapOf(raw.map((r) => r.lengthMs), strongSet);
    standOutCues.pitchSt = pitch === null ? null : round(pitch);
    standOutCues.loudDb = loud === null ? null : round(loud);
    standOutCues.lengthMs = length === null ? null : round(length, 0);
    const steps = [pitch === null ? null : pitch / STRESS.stepUp.pitchSt, loud === null ? null : loud / STRESS.stepUp.loudDb, length === null ? null : length / STRESS.stepUp.lengthMs].filter((v): v is number => v !== null);
    if (steps.length) standOut = round(mean(steps));
  }

  let strongOnWords = 0;
  let onContent = 0;
  if (words) {
    for (const s of scored) {
      if (!s.strong || s.wordIndex === null) continue;
      strongOnWords++;
      if (!isStopword(normalizeWord(words[s.wordIndex].text))) onContent++;
    }
  }

  return {
    peaks: scored,
    standOut,
    standOutCues,
    strongPeaks: strongCount,
    strongOnWords,
    contentShare: words && strongOnWords >= STRESS.minWordPeaks ? round(onContent / strongOnWords) : null,
  };
}

// The word whose best peak ranks highest, by the combined score or by loudness
// alone (today's cue). null when no peak lands on a word.
export function strongestWord(result: StressResult, by: "score" | "loudness" = "score"): number | null {
  let best: number | null = null;
  let bestValue = -Infinity;
  for (const p of result.peaks) {
    if (p.wordIndex === null) continue;
    const v = by === "score" ? p.score : p.levelDb;
    if (v > bestValue) {
      bestValue = v;
      best = p.wordIndex;
    }
  }
  return best;
}
