import { DEFAULT_PRESENCE_THRESHOLDS, type PresenceSample } from "../../presenceMetrics";
import {
  CALIBRATION_MS,
  CALIBRATION_STEPS,
  SETTLE_MS,
  STEP_MS,
  THRESHOLD_FIELDS,
  coverTransform,
  describeLook,
  formatThresholdsAsCode,
  formatThresholdValue,
  gazeStats,
  mapPoint,
  nudgeThreshold,
  stepForTime,
  summarizeCalibration,
  thresholdsEqual,
  type CalibrationSample,
} from "../faceLab";

const sample = (extra: Partial<PresenceSample> = {}): PresenceSample => ({
  tMs: 0,
  present: true,
  yaw: 0,
  pitch: 0,
  roll: 0,
  smile: 0.1,
  eyesOpen: 0.9,
  framed: true,
  gazeX: 0,
  gazeY: 0,
  ...extra,
});

describe("overlay geometry", () => {
  it("covers a wider view by scaling to the width and cropping the height", () => {
    const t = coverTransform({ width: 480, height: 640 }, { width: 360, height: 360 });
    expect(t.scale).toBeCloseTo(0.75);
    expect(t.offsetX).toBeCloseTo(0);
    expect(t.offsetY).toBeCloseTo((360 - 480) / 2);
  });

  it("maps the image center to the view center, mirrored or not", () => {
    const image = { width: 480, height: 640 };
    const view = { width: 360, height: 360 };
    expect(mapPoint(0.5, 0.5, image, view, false)).toEqual({ x: 180, y: 180 });
    expect(mapPoint(0.5, 0.5, image, view, true)).toEqual({ x: 180, y: 180 });
  });

  it("flips x when mirrored", () => {
    const image = { width: 400, height: 400 };
    const view = { width: 400, height: 400 };
    expect(mapPoint(0.25, 0.5, image, view, false).x).toBeCloseTo(100);
    expect(mapPoint(0.25, 0.5, image, view, true).x).toBeCloseTo(300);
  });
});

describe("describeLook", () => {
  it("words each reason", () => {
    expect(describeLook({ looking: true, reason: "on_lens" })).toBe("On the lens");
    expect(describeLook({ looking: false, reason: "no_face" })).toBe("No face");
    expect(describeLook({ looking: true, reason: "blink" })).toBe("Blink (counts as on)");
    expect(describeLook({ looking: false, reason: "eyes_away", value: 0.42, limit: 0.35 })).toBe("Away: eyes 0.42 > 0.35");
    expect(describeLook({ looking: false, reason: "head_away", value: 24.4, limit: 20 })).toBe("Away: head 24° > 20°");
  });
});

describe("stepForTime", () => {
  it("walks through the steps and settles at the start of each", () => {
    expect(stepForTime(0)).toEqual({ index: 0, settling: true, remainingMs: STEP_MS });
    expect(stepForTime(SETTLE_MS)).toMatchObject({ index: 0, settling: false });
    expect(stepForTime(STEP_MS + 100)).toMatchObject({ index: 1, settling: true });
    expect(stepForTime(CALIBRATION_MS - 1)).toMatchObject({ index: CALIBRATION_STEPS.length - 1 });
  });
  it("is null outside the run", () => {
    expect(stepForTime(-1)).toBeNull();
    expect(stepForTime(CALIBRATION_MS)).toBeNull();
  });
});

describe("summarizeCalibration", () => {
  const run = (stepIndex: number, count: number, extra: Partial<PresenceSample>): CalibrationSample[] =>
    Array.from({ length: count }, () => ({ step: stepIndex, sample: sample(extra) }));

  const samples = [
    ...run(0, 20, {}),
    ...run(1, 20, { gazeY: -0.2 }),
    ...run(2, 20, { gazeY: -0.6 }),
    ...run(3, 20, { yaw: 35 }),
    ...run(4, 20, { eyesOpen: 0.05 }),
  ];

  it("scores each step against what the rules should do", () => {
    const results = summarizeCalibration(samples, DEFAULT_PRESENCE_THRESHOLDS);
    expect(results.map((r) => r.lookingPercent)).toEqual([100, 100, 0, 0, 100]);
    expect(results.every((r) => r.passed === true)).toBe(true);
    expect(results[2].reasons).toEqual({ eyes_away: 20 });
    expect(results[3].reasons).toEqual({ head_away: 20 });
    expect(results[4].reasons).toEqual({ blink: 20 });
  });

  it("flags a step the rules get wrong", () => {
    const loose = { ...DEFAULT_PRESENCE_THRESHOLDS, gazeMaxOffset: 0.9 };
    const results = summarizeCalibration(samples, loose);
    expect(results[2].lookingPercent).toBe(100);
    expect(results[2].passed).toBe(false);
  });

  it("does not judge a step with too little data", () => {
    const results = summarizeCalibration(run(0, 2, {}), DEFAULT_PRESENCE_THRESHOLDS);
    expect(results[0].passed).toBeNull();
    expect(results[1].lookingPercent).toBeNull();
  });
});

describe("gazeStats", () => {
  it("is null with no gaze data", () => {
    expect(gazeStats([])).toBeNull();
    expect(gazeStats([{ ...sample(), gazeX: undefined }])).toBeNull();
  });
  it("takes percentiles of the absolute gaze and yaw", () => {
    const samples = Array.from({ length: 11 }, (_, i) => sample({ gazeX: i % 2 ? -i / 10 : i / 10, gazeY: -i / 10, yaw: -i }));
    const stats = gazeStats(samples)!;
    expect(stats.gazeXAbs.p50).toBeCloseTo(0.5);
    expect(stats.gazeXAbs.p90).toBeCloseTo(0.9);
    expect(stats.gazeY.p10).toBeCloseTo(-0.9);
    expect(stats.yawAbs.p50).toBe(5);
  });
});

describe("thresholds", () => {
  const field = (key: string) => THRESHOLD_FIELDS.find((f) => f.key === key)!;

  it("covers every threshold exactly once", () => {
    expect(THRESHOLD_FIELDS.map((f) => f.key).sort()).toEqual(Object.keys(DEFAULT_PRESENCE_THRESHOLDS).sort());
  });

  it("keeps every default inside its range", () => {
    for (const f of THRESHOLD_FIELDS) {
      expect(DEFAULT_PRESENCE_THRESHOLDS[f.key]).toBeGreaterThanOrEqual(f.min);
      expect(DEFAULT_PRESENCE_THRESHOLDS[f.key]).toBeLessThanOrEqual(f.max);
    }
  });

  it("nudges without float drift and stops at the ends", () => {
    expect(nudgeThreshold(field("gazeMaxOffset"), 0.35, 1)).toBe(0.4);
    expect(nudgeThreshold(field("gazeMaxOffset"), 0.35, -1)).toBe(0.3);
    expect(nudgeThreshold(field("gazeMaxOffset"), 1, 1)).toBe(1);
    expect(nudgeThreshold(field("lookingDown"), -0.05, 1)).toBe(-0.05);
    expect(nudgeThreshold(field("gazeHeadMaxDeg"), 20, 1)).toBe(21);
  });

  it("formats values and compares sets", () => {
    expect(formatThresholdValue(field("gazeMaxOffset"), 0.35)).toBe("0.35");
    expect(formatThresholdValue(field("gazeHeadMaxDeg"), 20)).toBe("20°");
    expect(thresholdsEqual(DEFAULT_PRESENCE_THRESHOLDS, { ...DEFAULT_PRESENCE_THRESHOLDS })).toBe(true);
    expect(thresholdsEqual(DEFAULT_PRESENCE_THRESHOLDS, { ...DEFAULT_PRESENCE_THRESHOLDS, smile: 0.6 })).toBe(false);
  });

  it("formats a paste-ready snippet", () => {
    const code = formatThresholdsAsCode({ ...DEFAULT_PRESENCE_THRESHOLDS, gazeMaxOffset: 0.4 });
    expect(code.startsWith("export const DEFAULT_PRESENCE_THRESHOLDS: PresenceThresholds = {")).toBe(true);
    expect(code).toContain("  gazeMaxOffset: 0.4,");
    expect(code.endsWith("};")).toBe(true);
  });
});
