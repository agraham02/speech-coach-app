import { classifyLook, type LookClassification, type PresenceSample, type PresenceThresholds } from "../presenceMetrics";

// Pure logic behind the Dev tab's Face Lab: where to draw the overlay, the
// guided calibration, and the threshold definitions.

// ---- Overlay geometry -------------------------------------------------

export interface Size {
  width: number;
  height: number;
}

// How a camera image is scaled to fill a view with resizeMode "cover": the
// image is scaled up to cover the view and centered, cropping the overflow.
export function coverTransform(image: Size, view: Size): { scale: number; offsetX: number; offsetY: number } {
  const scale = Math.max(view.width / image.width, view.height / image.height);
  return { scale, offsetX: (view.width - image.width * scale) / 2, offsetY: (view.height - image.height * scale) / 2 };
}

// A normalized (0-1) image point in view pixels. The front camera preview is
// mirrored, so the overlay usually has to flip x.
export function mapPoint(nx: number, ny: number, image: Size, view: Size, mirror: boolean): { x: number; y: number } {
  const { scale, offsetX, offsetY } = coverTransform(image, view);
  const x = nx * image.width * scale + offsetX;
  const y = ny * image.height * scale + offsetY;
  return { x: mirror ? view.width - x : x, y };
}

// ---- Status wording ---------------------------------------------------

const f2 = (n: number) => n.toFixed(2);
const f0 = (n: number) => String(Math.round(n));

// The live status pill's text for one classification.
export function describeLook(c: LookClassification): string {
  switch (c.reason) {
    case "no_face":
      return "No face";
    case "blink":
      return "Blink (counts as on)";
    case "head_away":
      return "Away: head " + f0(c.value ?? 0) + "° > " + f0(c.limit ?? 0) + "°";
    case "eyes_away":
      return "Away: eyes " + f2(c.value ?? 0) + " > " + f2(c.limit ?? 0);
    default:
      return "On the lens";
  }
}

// ---- Calibration ------------------------------------------------------

export interface CalibrationStep {
  id: string;
  prompt: string;
  // What the current rules are meant to do with this behaviour. Looking at
  // your own preview counts as on the lens on purpose (see the thresholds).
  expectLooking: boolean;
}

export const CALIBRATION_STEPS: CalibrationStep[] = [
  { id: "lens", prompt: "Look at the camera lens", expectLooking: true },
  { id: "preview", prompt: "Look at your own face on the screen", expectLooking: true },
  { id: "notes", prompt: "Look at notes just below the phone", expectLooking: false },
  { id: "away", prompt: "Look away to one side", expectLooking: false },
  { id: "eyes_closed", prompt: "Close your eyes", expectLooking: true },
];

export const STEP_MS = 5000;
// The start of each step is skipped: your eyes are still moving there.
export const SETTLE_MS = 1200;
export const CALIBRATION_MS = CALIBRATION_STEPS.length * STEP_MS;

export interface StepClock {
  index: number;
  settling: boolean;
  remainingMs: number;
}

// Which step a moment (ms since the run started) falls in; null once done.
export function stepForTime(tMs: number): StepClock | null {
  if (tMs < 0 || tMs >= CALIBRATION_MS) return null;
  const index = Math.floor(tMs / STEP_MS);
  const into = tMs - index * STEP_MS;
  return { index, settling: into < SETTLE_MS, remainingMs: STEP_MS - into };
}

export interface CalibrationSample {
  step: number;
  sample: PresenceSample;
}

export interface StepResult {
  step: CalibrationStep;
  samples: number;
  lookingPercent: number | null;
  reasons: Partial<Record<LookClassification["reason"], number>>;
  // Did the rules treat this step the way they are meant to? Null with too
  // little data to say.
  passed: boolean | null;
}

const MIN_STEP_SAMPLES = 5;
const PASS_ON = 80;
const PASS_OFF = 20;

export function summarizeCalibration(samples: CalibrationSample[], t: PresenceThresholds): StepResult[] {
  const hasGaze = samples.some((s) => s.sample.present && s.sample.gazeX !== undefined);
  return CALIBRATION_STEPS.map((step, index) => {
    const mine = samples.filter((s) => s.step === index);
    const reasons: StepResult["reasons"] = {};
    let looking = 0;
    for (const { sample } of mine) {
      const c = classifyLook(sample, t, hasGaze);
      if (c.looking) looking += 1;
      reasons[c.reason] = (reasons[c.reason] ?? 0) + 1;
    }
    const enough = mine.length >= MIN_STEP_SAMPLES;
    const lookingPercent = mine.length ? Math.round((looking / mine.length) * 100) : null;
    const passed = !enough || lookingPercent === null ? null : step.expectLooking ? lookingPercent >= PASS_ON : lookingPercent <= PASS_OFF;
    return { step, samples: mine.length, lookingPercent, reasons, passed };
  });
}

function quantile(sortedAscending: number[], p: number): number {
  return sortedAscending[Math.floor((sortedAscending.length - 1) * p)];
}

export interface GazeStats {
  gazeXAbs: { p50: number; p90: number };
  gazeY: { p10: number; p50: number };
  yawAbs: { p50: number; p90: number };
}

// The same percentiles presenceStep logs for each take, for a run.
export function gazeStats(samples: PresenceSample[]): GazeStats | null {
  const present = samples.filter((s) => s.present && s.gazeX !== undefined);
  if (present.length === 0) return null;
  const sorted = (values: number[]) => [...values].sort((a, b) => a - b);
  const gx = sorted(present.map((s) => Math.abs(s.gazeX ?? 0)));
  const gy = sorted(present.map((s) => s.gazeY ?? 0));
  const yaw = sorted(present.map((s) => Math.abs(s.yaw)));
  return {
    gazeXAbs: { p50: quantile(gx, 0.5), p90: quantile(gx, 0.9) },
    gazeY: { p10: quantile(gy, 0.1), p50: quantile(gy, 0.5) },
    yawAbs: { p50: quantile(yaw, 0.5), p90: quantile(yaw, 0.9) },
  };
}

// ---- Thresholds -------------------------------------------------------

export interface ThresholdField {
  key: keyof PresenceThresholds;
  label: string;
  hint: string;
  step: number;
  min: number;
  max: number;
  decimals: number;
  unit?: string;
}

export const THRESHOLD_FIELDS: ThresholdField[] = [
  { key: "gazeMaxOffset", label: "Eyes off the lens", hint: "Eye offset still counted as on the lens", step: 0.05, min: 0.05, max: 1, decimals: 2 },
  { key: "lookingDown", label: "Looking down", hint: "Eyes this far below the lens count as down", step: 0.05, min: -1, max: -0.05, decimals: 2 },
  { key: "lookingUp", label: "Looking up", hint: "Eyes this far above the lens count as up", step: 0.05, min: 0.05, max: 1, decimals: 2 },
  { key: "gazeHeadMaxDeg", label: "Head turn (with gaze)", hint: "Head angle allowed while the eyes are checked", step: 1, min: 5, max: 45, decimals: 0, unit: "°" },
  { key: "eyeContactMaxDeg", label: "Head turn (head only)", hint: "Used for older takes without gaze", step: 1, min: 5, max: 45, decimals: 0, unit: "°" },
  { key: "eyesClosed", label: "Eyes closed", hint: "Openness below this is a blink", step: 0.05, min: 0.05, max: 0.7, decimals: 2 },
  { key: "tiltedDeg", label: "Head tilt", hint: "Roll beyond this counts as tilted", step: 1, min: 3, max: 30, decimals: 0, unit: "°" },
  { key: "smile", label: "Smile", hint: "Smile level counted as smiling", step: 0.05, min: 0.1, max: 0.9, decimals: 2 },
  { key: "browRaise", label: "Brow raise", hint: "Counted as an eyebrow lift", step: 0.05, min: 0.1, max: 0.9, decimals: 2 },
  { key: "tense", label: "Tension", hint: "Frown or pressed lips counted as tense", step: 0.05, min: 0.1, max: 0.9, decimals: 2 },
];

export function formatThresholdValue(field: ThresholdField, value: number): string {
  return value.toFixed(field.decimals) + (field.unit ?? "");
}

// One step of a threshold, kept in range and free of float drift.
export function nudgeThreshold(field: ThresholdField, value: number, direction: 1 | -1): number {
  const next = value + direction * field.step;
  const clamped = Math.min(field.max, Math.max(field.min, next));
  return Number(clamped.toFixed(4));
}

export function thresholdsEqual(a: PresenceThresholds, b: PresenceThresholds): boolean {
  return THRESHOLD_FIELDS.every((f) => a[f.key] === b[f.key]);
}

// A paste-ready snippet to replace DEFAULT_PRESENCE_THRESHOLDS with.
export function formatThresholdsAsCode(t: PresenceThresholds): string {
  const lines = THRESHOLD_FIELDS.map((f) => "  " + f.key + ": " + t[f.key] + ",");
  return "export const DEFAULT_PRESENCE_THRESHOLDS: PresenceThresholds = {\n" + lines.join("\n") + "\n};";
}
