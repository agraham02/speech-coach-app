import type { PresenceSample } from "./presenceMetrics";

// What Tono says it sees on a face, in words: where the eyes point, how the
// head is held, smile, brows. Everything is read against the person's own
// "looking at the lens" center, so a phone held low or a lazy eye does not
// skew it. Pure.

// One moment of the face: the presence sample plus two head proxies from the
// landmarks (see faceSignals.headProxies).
export interface FaceReading {
  tMs: number;
  sample: PresenceSample;
  framed: boolean;
  tip: number;
  turn: number;
}

// The person's own neutral: eyes on the lens, head level, face at rest.
export interface FaceCenter {
  gazeX: number;
  gazeY: number;
  yaw: number;
  pitch: number;
  tip: number;
  turn: number;
  smile: number;
  browRaise: number;
}

export const ZERO_CENTER: FaceCenter = { gazeX: 0, gazeY: 0, yaw: 0, pitch: 0, tip: 0, turn: 0, smile: 0, browRaise: 0 };

export interface ReadoutLimits {
  // Eyes this far from the center (gaze units, ~0.35 is 10 degrees) are looking somewhere else.
  gazeOn: number;
  // Head proxy changes that count as tipped or turned.
  tip: number;
  turn: number;
  // Rises over the resting face that count as a smile or raised brows.
  smile: number;
  brow: number;
  // Below this, the eyes are shut and the gaze reading is not trusted.
  eyesOpenAtLeast: number;
}

export const READOUT_LIMITS: ReadoutLimits = { gazeOn: 0.3, tip: 0.035, turn: 0.05, smile: 0.25, brow: 0.25, eyesOpenAtLeast: 0.3 };

export type FacePlace = "out" | "edge" | "in";
export type EyeDirection = "closed" | "on" | "left" | "right" | "up" | "down";
export type HeadDirection = "level" | "up" | "down" | "left" | "right";

export interface Readout {
  face: FacePlace;
  eyes: EyeDirection | null;
  head: HeadDirection | null;
  smiling: boolean;
  brows: boolean;
}

export const NO_READOUT: Readout = { face: "out", eyes: null, head: null, smiling: false, brows: false };

// Everything measured against the center, positive = toward the user's right
// (x), up (gaze y), tipped down (tip).
export function measure(r: FaceReading, c: FaceCenter) {
  const s = r.sample;
  return {
    dx: (s.gazeX ?? 0) - c.gazeX,
    dy: (s.gazeY ?? 0) - c.gazeY,
    tip: r.tip - c.tip,
    turn: r.turn - c.turn,
    smile: s.smile - c.smile,
    brow: (s.browRaise ?? 0) - c.browRaise,
    eyesOpen: s.eyesOpen,
  };
}

export function readFace(reading: FaceReading | null, center: FaceCenter = ZERO_CENTER, limits: ReadoutLimits = READOUT_LIMITS): Readout {
  if (!reading || !reading.sample.present) return NO_READOUT;
  const m = measure(reading, center);
  let eyes: EyeDirection;
  if (m.eyesOpen < limits.eyesOpenAtLeast) eyes = "closed";
  else if (Math.hypot(m.dx, m.dy) < limits.gazeOn) eyes = "on";
  else if (Math.abs(m.dx) >= Math.abs(m.dy)) eyes = m.dx > 0 ? "right" : "left";
  else eyes = m.dy > 0 ? "up" : "down";

  const tipRatio = Math.abs(m.tip) / limits.tip;
  const turnRatio = Math.abs(m.turn) / limits.turn;
  let head: HeadDirection = "level";
  if (Math.max(tipRatio, turnRatio) >= 1) {
    head = tipRatio >= turnRatio ? (m.tip > 0 ? "down" : "up") : m.turn > 0 ? "right" : "left";
  }
  return {
    face: reading.framed ? "in" : "edge",
    eyes,
    head,
    smiling: m.smile >= limits.smile,
    brows: m.brow >= limits.brow,
  };
}

// --- Words --------------------------------------------------------------------

export const FACE_LABEL: Record<FacePlace, string> = { out: "Out of frame", edge: "Near the edge", in: "In frame" };
export const EYES_LABEL: Record<EyeDirection, string> = {
  closed: "Closed",
  on: "On the screen",
  left: "Off to your left",
  right: "Off to your right",
  up: "Looking up",
  down: "Looking down",
};
export const HEAD_LABEL: Record<HeadDirection, string> = {
  level: "Level",
  up: "Tipped up",
  down: "Tipped down",
  left: "Turned left",
  right: "Turned right",
};

// --- Steadier labels ------------------------------------------------------------

// A label changes only after it has been seen on `confirm` frames in a row,
// so a flicker at a threshold does not flicker the screen. (Frames arrive
// about ten a second, so 2 is a fifth of a second.)
export class ReadoutSmoother {
  private shown: Readout = NO_READOUT;
  private candidates: Partial<Record<keyof Readout, { value: unknown; n: number }>> = {};

  constructor(private readonly confirm = 2) {}

  push(raw: Readout): Readout {
    const next: Record<string, unknown> = { ...this.shown };
    for (const key of Object.keys(raw) as (keyof Readout)[]) {
      const value = raw[key];
      if (value === this.shown[key]) {
        delete this.candidates[key];
        continue;
      }
      const seen = this.candidates[key];
      const n = seen && seen.value === value ? seen.n + 1 : 1;
      this.candidates[key] = { value, n };
      if (n >= this.confirm) {
        next[key] = value;
        delete this.candidates[key];
      }
    }
    this.shown = next as unknown as Readout;
    return this.shown;
  }

  reset(): void {
    this.shown = NO_READOUT;
    this.candidates = {};
  }
}

// --- Things to try ----------------------------------------------------------------

export const TRIES = [
  { id: "left", label: "Look left" },
  { id: "right", label: "Look right" },
  { id: "up", label: "Chin up" },
  { id: "down", label: "Chin down" },
  { id: "smile", label: "Smile" },
  { id: "brows", label: "Raise your brows" },
  { id: "out", label: "Step out of frame" },
] as const;

export type TryId = (typeof TRIES)[number]["id"];

// How long something has to hold before it ticks, and how long the face has
// to be gone before "step out of frame" counts.
export const TRY_HOLD_MS = 400;
export const OUT_MS = 700;
const MIN_PEAK_SAMPLES = 3;

// The strongest each thing got while it was being tried (medians, so one
// twitchy frame does not set them). Gaze and head values are distances from
// the center; smile and brows are rises over the resting face.
export interface TryPeaks {
  gazeLeft?: number;
  gazeRight?: number;
  tipUp?: number;
  tipDown?: number;
  smile?: number;
  brows?: number;
}

type PeakKey = keyof TryPeaks;

export interface TryState {
  done: TryId[];
  holdSince: Partial<Record<TryId, number>>;
  buffers: Partial<Record<PeakKey, number[]>>;
  peaks: TryPeaks;
  outSince: number | null;
  wasOut: boolean;
}

export function newTryState(): TryState {
  return { done: [], holdSince: {}, buffers: {}, peaks: {}, outSince: null, wasOut: false };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const PEAK_KEY: Partial<Record<TryId, PeakKey>> = { left: "gazeLeft", right: "gazeRight", up: "tipUp", down: "tipDown", smile: "smile", brows: "brows" };

// Feeds one frame (null = no face) and returns the new state plus anything
// that just ticked. Never goes back: a done try stays done.
export function feedTries(prev: TryState, reading: FaceReading | null, center: FaceCenter, tMs: number, limits: ReadoutLimits = READOUT_LIMITS): { state: TryState; newlyDone: TryId[] } {
  const state: TryState = {
    done: [...prev.done],
    holdSince: { ...prev.holdSince },
    buffers: { ...prev.buffers },
    peaks: { ...prev.peaks },
    outSince: prev.outSince,
    wasOut: prev.wasOut,
  };
  const newlyDone: TryId[] = [];
  const finish = (id: TryId) => {
    if (state.done.includes(id)) return;
    state.done.push(id);
    newlyDone.push(id);
  };

  if (!reading || !reading.sample.present) {
    state.outSince = state.outSince ?? tMs;
    if (tMs - state.outSince >= OUT_MS) state.wasOut = true;
    state.holdSince = {};
    state.buffers = {};
    return { state, newlyDone };
  }
  state.outSince = null;
  if (state.wasOut) {
    state.wasOut = false;
    finish("out");
  }

  const m = measure(reading, center);
  const eyesOpen = m.eyesOpen >= limits.eyesOpenAtLeast;
  const eyeLeft = eyesOpen && m.dx <= -limits.gazeOn && Math.abs(m.dx) >= Math.abs(m.dy);
  const eyeRight = eyesOpen && m.dx >= limits.gazeOn && Math.abs(m.dx) >= Math.abs(m.dy);
  const conditions: Record<Exclude<TryId, "out">, { holds: boolean; peak?: number }> = {
    left: { holds: eyeLeft || m.turn <= -limits.turn, peak: eyeLeft ? Math.abs(m.dx) : undefined },
    right: { holds: eyeRight || m.turn >= limits.turn, peak: eyeRight ? Math.abs(m.dx) : undefined },
    up: { holds: m.tip <= -limits.tip, peak: -m.tip },
    down: { holds: m.tip >= limits.tip, peak: m.tip },
    smile: { holds: m.smile >= limits.smile, peak: m.smile },
    brows: { holds: m.brow >= limits.brow, peak: m.brow },
  };

  for (const id of Object.keys(conditions) as (keyof typeof conditions)[]) {
    if (state.done.includes(id)) continue;
    const { holds, peak } = conditions[id];
    const key = PEAK_KEY[id]!;
    if (!holds) {
      delete state.holdSince[id];
      delete state.buffers[key];
      continue;
    }
    state.holdSince[id] = state.holdSince[id] ?? tMs;
    if (peak !== undefined) state.buffers[key] = [...(state.buffers[key] ?? []), peak];
    if (tMs - state.holdSince[id]! >= TRY_HOLD_MS) {
      const buffer = state.buffers[key];
      if (buffer && buffer.length >= MIN_PEAK_SAMPLES) state.peaks[key] = median(buffer);
      finish(id);
    }
  }
  return { state, newlyDone };
}

// --- Finding the center -------------------------------------------------------------

export interface CenterSummary {
  center: FaceCenter;
  usable: boolean;
  // Parts left at zero because the person was plainly not looking at the lens.
  discarded: ("gaze" | "pose")[];
}

const MIN_CENTER_READINGS = 8;
// Further off than this, the person was not looking at the lens.
const CENTER_MAX_GAZE = 0.25;
const CENTER_MAX_PITCH = 15;
const CENTER_MAX_YAW = 10;

// The center from a couple of seconds of "look at the camera": medians of the
// moments the face was framed and the eyes open. If the gaze or the pose is
// far from straight-on, that part stays at zero (the defaults) rather than
// teach the app that looking elsewhere is looking at the lens.
export function summarizeCenter(readings: FaceReading[]): CenterSummary {
  const good = readings.filter((r) => r.sample.present && r.framed && r.sample.eyesOpen >= 0.6);
  if (good.length < MIN_CENTER_READINGS) return { center: ZERO_CENTER, usable: false, discarded: [] };
  const med = (pick: (r: FaceReading) => number) => median(good.map(pick));
  const gazeX = med((r) => r.sample.gazeX ?? 0);
  const gazeY = med((r) => r.sample.gazeY ?? 0);
  const yaw = med((r) => r.sample.yaw);
  const pitch = med((r) => r.sample.pitch);
  const discarded: CenterSummary["discarded"] = [];
  const gazeOk = Math.abs(gazeX) <= CENTER_MAX_GAZE && Math.abs(gazeY) <= CENTER_MAX_GAZE;
  const poseOk = Math.abs(pitch) <= CENTER_MAX_PITCH && Math.abs(yaw) <= CENTER_MAX_YAW;
  if (!gazeOk) discarded.push("gaze");
  if (!poseOk) discarded.push("pose");
  return {
    usable: true,
    discarded,
    center: {
      gazeX: gazeOk ? gazeX : 0,
      gazeY: gazeOk ? gazeY : 0,
      yaw: poseOk ? yaw : 0,
      pitch: poseOk ? pitch : 0,
      // Proxies and the resting expression are measured against themselves.
      tip: med((r) => r.tip),
      turn: med((r) => r.turn),
      smile: med((r) => r.sample.smile),
      browRaise: med((r) => r.sample.browRaise ?? 0),
    },
  };
}
