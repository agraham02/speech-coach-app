import type { FaceCenter, TryPeaks } from "./faceReadout";
import { DEFAULT_PRESENCE_THRESHOLDS, type PresenceSample, type PresenceThresholds } from "./presenceMetrics";

// What the face check learns about this face, and how it is applied to the
// presence scoring: gaze and pose are measured from the person's own
// "looking at the lens", and the smile, brow and eye-contact cut-offs move
// toward what their face actually does. Everything stays within bounds, and
// anything the person skipped keeps its default. Raw values are stored, so
// the formulas can improve later. Pure.

export interface FaceCalibration {
  version: 1;
  at: string;
  platform: string;
  // Where the eyes and head are when looking at the lens.
  center: { gazeX: number; gazeY: number; yaw: number; pitch: number; tip?: number; turn?: number };
  // The face at rest.
  rest: { smile: number; browRaise: number };
  // The strongest each thing got when tried (see TryPeaks).
  peaks: TryPeaks;
}

export function buildCalibration(center: FaceCenter, peaks: TryPeaks, now: Date, platform: string): FaceCalibration {
  return {
    version: 1,
    at: now.toISOString(),
    platform,
    center: { gazeX: center.gazeX, gazeY: center.gazeY, yaw: center.yaw, pitch: center.pitch, tip: center.tip, turn: center.turn },
    rest: { smile: center.smile, browRaise: center.browRaise },
    peaks,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round3 = (v: number) => Math.round(v * 1000) / 1000;

// A rise over rest has to be this clear before it moves a cut-off.
const MIN_RISE = 0.2;
const GAZE_SHARE = 0.6;

// The default cut-offs, moved toward this face within bounds.
export function calibratedThresholds(cal: FaceCalibration, base: PresenceThresholds = DEFAULT_PRESENCE_THRESHOLDS): PresenceThresholds {
  const out = { ...base };
  const { smile, brows, gazeLeft, gazeRight } = cal.peaks;
  if (smile !== undefined && smile >= MIN_RISE) out.smile = round3(clamp(cal.rest.smile + smile / 2, 0.3, 0.7));
  if (brows !== undefined && brows >= MIN_RISE) out.browRaise = round3(clamp(cal.rest.browRaise + brows / 2, 0.3, 0.7));
  const sides = [gazeLeft, gazeRight].filter((v): v is number => v !== undefined && v > 0);
  if (sides.length) out.gazeMaxOffset = round3(clamp(Math.min(...sides) * GAZE_SHARE, 0.28, 0.45));
  return out;
}

// One sample measured from the person's own center. Samples without a face
// (and old ones without gaze) pass through.
export function normalizeSample(s: PresenceSample, cal: FaceCalibration): PresenceSample {
  if (!s.present) return s;
  return {
    ...s,
    yaw: s.yaw - cal.center.yaw,
    pitch: s.pitch - cal.center.pitch,
    gazeX: s.gazeX === undefined ? undefined : s.gazeX - cal.center.gazeX,
    gazeY: s.gazeY === undefined ? undefined : s.gazeY - cal.center.gazeY,
  };
}

export function normalizeTimeline(timeline: PresenceSample[], cal: FaceCalibration): PresenceSample[] {
  return timeline.map((s) => normalizeSample(s, cal));
}

// A saved value from storage, checked before it is trusted.
export function parseCalibration(raw: string | undefined | null): FaceCalibration | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<FaceCalibration>;
    const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
    if (v.version !== 1 || !v.center || !v.rest) return null;
    const { gazeX, gazeY, yaw, pitch } = v.center;
    if (![gazeX, gazeY, yaw, pitch, v.rest.smile, v.rest.browRaise].every(num)) return null;
    return v as FaceCalibration;
  } catch {
    return null;
  }
}
