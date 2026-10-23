import { summarizePitch, type PitchTrack } from "../dsp/pitchTracker";

// Dev tab Voice Lab: the current pitch tracker and the candidate side by
// side on one take, as plain numbers that can be pasted back. Pure.

export interface TrackerSummary {
  frames: number;
  voicedPercent: number;
  medianHz: number | null;
  // What sessionScore uses today: max minus min, in Hz.
  hzRange: number | null;
  // p10 to p90 in semitones around the median, and the SD in semitones.
  rangeSemitones: number | null;
  sdSemitones: number | null;
  elapsedMs: number;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

// Today's contour: one value per 200 ms bucket, null when unvoiced.
export function summarizeBuckets(contourHz: (number | null)[], elapsedMs: number): TrackerSummary {
  const voiced = contourHz.filter((v): v is number => v !== null).sort((a, b) => a - b);
  const base = { frames: contourHz.length, voicedPercent: contourHz.length ? round((100 * voiced.length) / contourHz.length) : 0, elapsedMs: Math.round(elapsedMs) };
  if (voiced.length < 4) return { ...base, medianHz: null, hzRange: null, rangeSemitones: null, sdSemitones: null };
  const med = percentile(voiced, 0.5);
  const st = voiced.map((v) => 12 * Math.log2(v / med));
  const mean = st.reduce((a, b) => a + b, 0) / st.length;
  const sd = Math.sqrt(st.reduce((a, b) => a + (b - mean) ** 2, 0) / st.length);
  return {
    ...base,
    medianHz: round(med),
    hzRange: round(voiced[voiced.length - 1] - voiced[0]),
    rangeSemitones: round(percentile(st, 0.9) - percentile(st, 0.1), 2),
    sdSemitones: round(sd, 2),
  };
}

export function summarizeTrack(track: PitchTrack, elapsedMs: number): TrackerSummary {
  const s = summarizePitch(track);
  const voiced = track.frames.filter((f) => f.f0Hz !== null).map((f) => f.f0Hz as number);
  return {
    frames: track.frames.length,
    voicedPercent: track.frames.length ? round((100 * voiced.length) / track.frames.length) : 0,
    medianHz: s.medianHz != null ? round(s.medianHz) : null,
    hzRange: voiced.length ? round(Math.max(...voiced) - Math.min(...voiced)) : null,
    rangeSemitones: s.rangeSemitones,
    sdSemitones: s.sdSemitones,
    elapsedMs: Math.round(elapsedMs),
  };
}

// Points for a chart: seconds and semitones from the median, null in gaps.
export function semitoneSeries(times: number[], hz: (number | null)[], medianHz: number | null): { t: number; st: number | null }[] {
  if (!medianHz) return times.map((t) => ({ t, st: null }));
  return times.map((t, i) => ({ t, st: hz[i] == null ? null : 12 * Math.log2((hz[i] as number) / medianHz) }));
}
