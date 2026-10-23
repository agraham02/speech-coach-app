import type { AudioFeatures } from "../dsp/audioFeatures";
import { pausesFromFeatures } from "../dsp/pauses";
import { loudnessStatsOf, pitchStatsOf, voiceChartData } from "../signals/audioSummary";

// Dev tab Voice Lab: what the app's audio extractor measures on one take, as
// plain numbers that can be pasted back, plus where it ran and how long it
// took. Pure.

export interface VoiceLabSummary {
  frames: number;
  voicedPercent: number;
  voicedSeconds: number | null;
  medianHz: number | null;
  rangeSemitones: number | null;
  sdSemitones: number | null;
  meanConfidence: number | null;
  noiseFloorDb: number;
  speechMedianDbfs: number | null;
  loudnessSpreadDb: number | null;
  syllablePeakSdDb: number | null;
  snrDb: number | null;
  pauses: number;
  breaths: number;
  syllablePeaks: number;
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

export function summarizeFeatures(f: AudioFeatures): VoiceLabSummary {
  const pitch = pitchStatsOf(f);
  const loud = loudnessStatsOf(f);
  const pauses = pausesFromFeatures(f);
  let voiced = 0;
  for (let i = 0; i < f.f0Hz.length; i++) if (f.f0Hz[i] > 0) voiced++;
  return {
    frames: f.f0Hz.length,
    voicedPercent: f.f0Hz.length ? round((100 * voiced) / f.f0Hz.length) : 0,
    voicedSeconds: pitch?.voicedSeconds ?? null,
    medianHz: pitch?.medianHz ?? null,
    rangeSemitones: pitch?.rangeSemitones ?? null,
    sdSemitones: pitch?.sdSemitones ?? null,
    meanConfidence: pitch?.meanConfidence ?? null,
    noiseFloorDb: round(f.noiseFloorDb),
    speechMedianDbfs: loud?.speechMedianDbfs ?? null,
    loudnessSpreadDb: loud?.spreadDb ?? null,
    syllablePeakSdDb: loud?.syllablePeakSdDb ?? null,
    snrDb: loud?.snrDb ?? null,
    pauses: pauses.pauses.length,
    breaths: pauses.breaths,
    syllablePeaks: f.peaks.length,
  };
}

// Points for the lab's chart: seconds and semitones from the median, null
// in gaps, at most `maxPoints` of them.
export function labChartPoints(f: AudioFeatures, maxPoints = 400): { t: number; st: number | null }[] {
  const chart = voiceChartData(f, maxPoints);
  return chart.tMs.map((t, i) => ({ t: (t + chart.bucketMs / 2) / 1000, st: chart.pitchSt[i] }));
}
