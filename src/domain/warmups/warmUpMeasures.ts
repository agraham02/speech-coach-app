import type { AudioFeatures } from "../dsp/audioFeatures";
import { failedGate, PASSED, type GateVerdict } from "../gates";

// Warm-ups get a number (docs/overhaul/PLAN.md, section 7, "Warm-ups"):
// - Low breath and Calming sigh: rounds finished ÷ rounds. A silent breath
//   can't be heard, so this is your own count, and it moves Settling lightly.
// - Steady hiss: seconds of steady sound ÷ the target, and how even it was.
// - Wake up the articulators: pa-ta-ka syllables a second; 5 or more is 100.
// - Hum and siren: the siren's lowest to highest note in semitones; 12 or more
//   is 100 (Pitch variety is on probation, so it moves nothing yet).
// The whole warm-up is recorded once; each measured step is a window of it.
// Every threshold here is a first guess, to tune from real recordings. Pure.

export type WarmUpMeasure = "hiss" | "pataka" | "siren";

export interface MeasuredWindow {
  measure: WarmUpMeasure;
  startMs: number;
  endMs: number;
}

export interface WarmUpTargets {
  // Seconds of steady hiss for full marks (the step's length; 3d.5 raises it).
  hissSeconds: number;
  // Pa-ta-ka syllables a second for full marks.
  patakaRate: number;
  // Siren range in semitones for full marks.
  sirenSemitones: number;
}

export const DEFAULT_WARM_UP_TARGETS: WarmUpTargets = { hissSeconds: 10, patakaRate: 5, sirenSemitones: 12 };

export interface WarmUpPart {
  label: string;
  note: string;
}

export interface WarmUpScore {
  // 0-1, null when nothing could be scored.
  score: number | null;
  gate: GateVerdict;
  parts: WarmUpPart[];
}

// A frame is sound when it is this far above the recording's quiet floor.
export const SOUND_ABOVE_FLOOR_DB = 12;
// A gap shorter than this inside a hiss doesn't end it (a wobble, not a stop).
export const HISS_GAP_MS = 150;
// How even: a spread of loudness at or under GOOD is full marks, at or over BAD none.
export const EVEN_GOOD_DB = 2;
export const EVEN_BAD_DB = 8;
// A hiss's number: its length counts 70, its evenness 30.
const HISS_LENGTH_SHARE = 0.7;
// Less sound than this in a window is "not heard".
export const MIN_HEARD_MS = 1000;
// Pa-ta-ka needs this long between its first and last syllable to give a rate.
export const PATAKA_MIN_SPAN_MS = 2500;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const round2 = (x: number) => Math.round(x * 100) / 100;

type Track = Pick<AudioFeatures, "hopMs" | "offsetMs" | "levelDb" | "f0Hz" | "noiseFloorDb" | "peaks">;

function frameRange(track: Track, window: MeasuredWindow): [number, number] {
  const from = Math.max(0, Math.ceil((window.startMs - track.offsetMs) / track.hopMs));
  const to = Math.min(track.levelDb.length, Math.floor((window.endMs - track.offsetMs) / track.hopMs) + 1);
  return [from, Math.max(from, to)];
}

function std(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
}

// The longest stretch of sound in the window (short gaps bridged), and how much
// its loudness wandered.
export function hissRound(track: Track, window: MeasuredWindow, targetSeconds: number): { seconds: number; spreadDb: number; score: number } {
  const [from, to] = frameRange(track, window);
  const bar = track.noiseFloorDb + SOUND_ABOVE_FLOOR_DB;
  const maxGap = Math.round(HISS_GAP_MS / track.hopMs);
  let best: [number, number] | null = null;
  let start = -1;
  let lastSound = -1;
  for (let i = from; i <= to; i++) {
    const sound = i < to && track.levelDb[i] >= bar;
    if (sound) {
      if (start < 0 || i - lastSound > maxGap + 1) {
        if (start >= 0 && (!best || lastSound - start > best[1] - best[0])) best = [start, lastSound];
        start = i;
      }
      lastSound = i;
    }
  }
  if (start >= 0 && (!best || lastSound - start > best[1] - best[0])) best = [start, lastSound];
  if (!best) return { seconds: 0, spreadDb: 0, score: 0 };
  const levels: number[] = [];
  for (let i = best[0]; i <= best[1]; i++) if (track.levelDb[i] >= bar) levels.push(track.levelDb[i]);
  const seconds = ((best[1] - best[0] + 1) * track.hopMs) / 1000;
  const spreadDb = std(levels);
  const length = clamp01(seconds / targetSeconds);
  const even = clamp01((EVEN_BAD_DB - spreadDb) / (EVEN_BAD_DB - EVEN_GOOD_DB));
  // A blip can't be "even": evenness counts only as far as the length does.
  return { seconds, spreadDb, score: HISS_LENGTH_SHARE * length + (1 - HISS_LENGTH_SHARE) * even * length };
}

// Syllables a second, between the first and last syllable heard in the window.
export function patakaRate(track: Track, window: MeasuredWindow): { rate: number; spanMs: number; syllables: number } {
  const [from, to] = frameRange(track, window);
  const inside = Array.from(track.peaks).filter((p) => p >= from && p < to);
  if (inside.length < 2) return { rate: 0, spanMs: 0, syllables: inside.length };
  const spanMs = (inside[inside.length - 1] - inside[0]) * track.hopMs;
  return { rate: spanMs > 0 ? ((inside.length - 1) * 1000) / spanMs : 0, spanMs, syllables: inside.length };
}

// The siren's range: from its 5th to its 95th percentile pitch, in semitones,
// so a stray octave error at either end doesn't count.
export function sirenRange(track: Track, window: MeasuredWindow): { semitones: number; voicedMs: number } {
  const [from, to] = frameRange(track, window);
  const pitches: number[] = [];
  for (let i = from; i < to; i++) if (track.f0Hz[i] > 0) pitches.push(track.f0Hz[i]);
  const voicedMs = pitches.length * track.hopMs;
  if (pitches.length < 2) return { semitones: 0, voicedMs };
  pitches.sort((a, b) => a - b);
  const at = (p: number) => pitches[Math.min(pitches.length - 1, Math.max(0, Math.round(p * (pitches.length - 1))))];
  return { semitones: Math.max(0, 12 * Math.log2(at(0.95) / at(0.05))), voicedMs };
}

export function scoreBreathWarmUp(roundsFinished: number, rounds: number): WarmUpScore {
  if (rounds <= 0) return { score: null, gate: failedGate("Nothing to count."), parts: [] };
  const done = Math.max(0, Math.min(rounds, roundsFinished));
  if (done === 0) return { score: null, gate: failedGate("No round was finished, so there's nothing to count."), parts: [] };
  return { score: round2(done / rounds), gate: PASSED, parts: [{ label: "Rounds finished", note: `${done} of ${rounds} rounds` }] };
}

const NOT_HEARD: Record<WarmUpMeasure, string> = {
  hiss: "We didn't hear the hiss. Hold the phone closer and try again.",
  pataka: "We didn't hear the pa-ta-ka. Hold the phone closer and try again.",
  siren: "We didn't hear the siren. Try it on a clear “ng” or “ooh”.",
};

// One number for a warm-up with measured steps: the mean over its windows.
// A window you skipped counts as 0; if none was heard at all, it isn't scored.
export function scoreMeasuredWarmUp(track: Track, windows: MeasuredWindow[], targets: WarmUpTargets = DEFAULT_WARM_UP_TARGETS): WarmUpScore {
  if (!windows.length) return { score: null, gate: failedGate("Nothing in this warm-up was recorded."), parts: [] };
  const parts: WarmUpPart[] = [];
  const scores: number[] = [];
  let heard = false;
  windows.forEach((w, i) => {
    if (w.measure === "hiss") {
      const r = hissRound(track, w, targets.hissSeconds);
      if (r.seconds * 1000 >= MIN_HEARD_MS) heard = true;
      scores.push(r.score);
      parts.push({ label: windows.length > 1 ? `Hiss ${i + 1}` : "Hiss", note: r.seconds > 0 ? `${r.seconds.toFixed(1)} of ${targets.hissSeconds} seconds, ${r.spreadDb <= EVEN_GOOD_DB + 1 ? "very even" : r.spreadDb <= EVEN_BAD_DB - 2 ? "fairly even" : "uneven"}` : "Not heard" });
    } else if (w.measure === "pataka") {
      const r = patakaRate(track, w);
      const ok = r.spanMs >= PATAKA_MIN_SPAN_MS;
      if (r.spanMs >= MIN_HEARD_MS) heard = true;
      scores.push(ok ? clamp01(r.rate / targets.patakaRate) : 0);
      parts.push({ label: "Pa-ta-ka", note: ok ? `${r.rate.toFixed(1)} syllables a second (${targets.patakaRate} is full marks)` : r.syllables ? "Too short to time: keep it going for the whole step" : "Not heard" });
    } else {
      const r = sirenRange(track, w);
      const ok = r.voicedMs >= MIN_HEARD_MS;
      if (ok) heard = true;
      scores.push(ok ? clamp01(r.semitones / targets.sirenSemitones) : 0);
      parts.push({ label: "Siren", note: ok ? `${Math.round(r.semitones)} semitones from low to high (${targets.sirenSemitones} is full marks)` : "Not heard" });
    }
  });
  if (!heard) return { score: null, gate: failedGate(NOT_HEARD[windows[0].measure]), parts };
  return { score: round2(scores.reduce((s, v) => s + v, 0) / scores.length), gate: PASSED, parts };
}
