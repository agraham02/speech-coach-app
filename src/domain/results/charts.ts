import type { WpmPoint } from "../sessionTypes";
import type { VoiceChartData } from "../signals/audioSummary";
import type { Series } from "./timeline";

// What the Scores tab's three charts draw and on what scale. Each chart's
// scale is fixed by what the unit means, with room for what was measured, and
// never squeezed to the data: a flat voice must look flat. Pure.

export interface AxisTick {
  value: number;
  label: string;
}

export interface Axis {
  min: number;
  max: number;
  ticks: AxisTick[];
  // What the numbers on the axis are.
  unit: string;
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

function maxAbs(values: (number | null)[]): number {
  let m = 0;
  for (const v of values) if (v != null && Math.abs(v) > m) m = Math.abs(v);
  return m;
}

const roundUpTo = (n: number, step: number) => Math.ceil(n / step) * step;

// --- Pitch ---

// Semitones from the speaker's median. The range is at least 6 either way,
// so a 5 semitone spread (what scores full marks) fills 5/12 of the height,
// and it grows in steps of 3 when the voice goes wider; values past 12 are
// drawn at the edge. The old chart drew Hz from 0, where the same spread of a
// 120 Hz voice (40 Hz) took about 16% of a 0 to 250 Hz axis.
export const PITCH_MIN_HALF_RANGE_ST = 6;
export const PITCH_MAX_HALF_RANGE_ST = 12;

export function pitchAxis(pitchSt: (number | null)[]): Axis {
  const half = Math.min(PITCH_MAX_HALF_RANGE_ST, Math.max(PITCH_MIN_HALF_RANGE_ST, roundUpTo(maxAbs(pitchSt), 3)));
  const ticks = [-half, -half / 2, 0, half / 2, half].map((value) => ({ value, label: signed(value) }));
  return { min: -half, max: half, ticks, unit: "semitones" };
}

export function pitchSeries(chart: VoiceChartData): Series {
  return { tMs: chart.tMs, v: chart.pitchSt, bucketMs: chart.bucketMs };
}

// "+2.1 st, about 138 Hz": a reading on the pitch chart.
export function pitchReadout(st: number, medianHz: number | null): string {
  const rounded = Math.round(st * 10) / 10;
  const text = `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${Math.abs(rounded)} st`;
  if (medianHz == null) return text;
  return `${text} (about ${Math.round(medianHz * Math.pow(2, st / 12))} Hz)`;
}

// --- Loudness ---

export const LOUDNESS_MIN_HALF_RANGE_DB = 12;
export const LOUDNESS_MAX_HALF_RANGE_DB = 24;

// dB from your usual speaking level (the median while speaking), so the
// chart is about how you varied and doesn't depend on how close the phone was.
export function loudnessAxis(levelDb: (number | null)[]): Axis {
  const half = Math.min(LOUDNESS_MAX_HALF_RANGE_DB, Math.max(LOUDNESS_MIN_HALF_RANGE_DB, roundUpTo(maxAbs(levelDb), 6)));
  const ticks = [-half, -half / 2, 0, half / 2, half].map((value) => ({ value, label: signed(value) }));
  return { min: -half, max: half, ticks, unit: "dB" };
}

export function loudnessSeries(chart: VoiceChartData): Series {
  return { tMs: chart.tMs, v: chart.levelDb, bucketMs: chart.bucketMs };
}

export function loudnessReadout(db: number): string {
  const rounded = Math.round(db * 10) / 10;
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${Math.abs(rounded)} dB`;
}

// --- Pace ---

export const PACE_BUCKET_MS = 5_000;

export function paceAxis(curve: WpmPoint[]): Axis {
  const top = Math.max(200, roundUpTo(Math.max(0, ...curve.map((p) => p.wpm)) + 10, 50));
  const ticks: AxisTick[] = [];
  for (let v = 0; v <= top; v += 50) ticks.push({ value: v, label: `${v}` });
  return { min: 0, max: top, ticks, unit: "words a minute" };
}

// The pace curve on the shared time axis: words a minute in each 5 second
// window (a window with no words is 0 here, since a pause is a real pace of
// zero, unlike a gap in a pitch line).
export function paceSeries(curve: WpmPoint[]): Series {
  return { tMs: curve.map((p) => p.bucketStartSeconds * 1000), v: curve.map((p) => p.wpm), bucketMs: PACE_BUCKET_MS };
}

// --- Honesty line under a pitch chart ---

// How much of the speaking the pitch tracker could read, in words. The line is
// as dense as the data: this says so when the data is thin.
export function pitchCoverageNote(voicedShare: number | null, voicedSeconds: number | null): string | null {
  if (voicedShare == null || voicedSeconds == null) return null;
  const pct = Math.round(voicedShare * 100);
  const secs = Math.round(voicedSeconds);
  if (voicedShare < 0.4) {
    return `Pitch could be read for only ${pct}% of your speaking (${secs} s), so this line has many gaps. That comes from the recording and the tracker, not from how the chart is drawn.`;
  }
  return `Pitch read for ${pct}% of your speaking (${secs} s). The rest is consonants, breaths and pauses, shown as gaps.`;
}
