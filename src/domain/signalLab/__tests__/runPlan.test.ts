import { CAPTURE_CHECK } from "../captureCheck";
import { currentCue, CUE_WINDOW_MS, cueSchedule, failedEvaluation, makeResult, secondsLeft, stepDurationMs } from "../runPlan";
import type { LabStep, StepMeasure } from "../types";

const step: LabStep = {
  id: "s",
  title: "Brow lifts",
  instruction: "Lift your brows on cue",
  seconds: 20,
  capture: "face",
  cues: [
    { atMs: 2000, label: "Brows" },
    { atMs: 6000, label: "Smile" },
  ],
};

describe("running a step", () => {
  it("counts down in whole seconds and never below zero", () => {
    expect(stepDurationMs(step)).toBe(20_000);
    expect(secondsLeft(step, 0)).toBe(20);
    expect(secondsLeft(step, 1)).toBe(20);
    expect(secondsLeft(step, 19_100)).toBe(1);
    expect(secondsLeft(step, 25_000)).toBe(0);
  });

  it("shows a cue from its time until its window closes, and the latest one when two overlap", () => {
    expect(currentCue(step, 1000)).toBeNull();
    expect(currentCue(step, 2000)?.label).toBe("Brows");
    expect(currentCue(step, 2000 + CUE_WINDOW_MS)?.label).toBe("Brows");
    expect(currentCue(step, 2000 + CUE_WINDOW_MS + 1)).toBeNull();
    expect(currentCue(step, 6500)?.label).toBe("Smile");
    expect(currentCue({ ...step, cues: undefined }, 5000)).toBeNull();
  });

  it("records the cue schedule as step-time cues", () => {
    expect(cueSchedule(step)).toEqual([
      { tMs: 2000, label: "Brows" },
      { tMs: 6000, label: "Smile" },
    ]);
  });
});

describe("a finished run", () => {
  it("is stamped with the versions it ran on", () => {
    const outcome = { pass: true, checks: [], summary: "ok", numbers: {} };
    const r = makeResult("voice.pauses", outcome, { appVersion: "2.0.0", extractorVersion: "x", thresholdsVersion: 2 }, new Date("2026-11-06T10:00:00Z"));
    expect(r).toMatchObject({ testId: "voice.pauses", at: "2026-11-06T10:00:00.000Z", appVersion: "2.0.0", extractorVersion: "x", thresholdsVersion: 2 });
  });

  it("reads a test that threw as unclear, never pass or fail", () => {
    const o = failedEvaluation(new Error("boom"));
    expect(o.pass).toBeNull();
    expect(o.summary).toContain("boom");
  });
});

describe("the capture check", () => {
  const audio = (voicedPercent: number, frames: number): StepMeasure["audio"] =>
    ({ features: {} as never, summary: { frames, voicedPercent, voicedSeconds: 3, medianHz: 180, rangeSemitones: 4, sdSemitones: 2, meanConfidence: 0.8, noiseFloorDb: -60, speechMedianDbfs: -30, loudnessSpreadDb: 10, syllablePeakSdDb: 2, snrDb: 25, pauses: 1, breaths: 0, syllablePeaks: 12 } });

  it("passes when speech came through, and reports the face rate as information", () => {
    const out = CAPTURE_CHECK.evaluate({ say_a_sentence: { stepId: "say_a_sentence", durationMs: 8000, audio: audio(40, 800), face: [] } });
    expect(out.pass).toBe(true);
    expect(out.checks.find((c) => c.label === "Face detections")?.pass).toBeNull();
  });

  it("fails when the take was silent, and says nothing when nothing was captured", () => {
    expect(CAPTURE_CHECK.evaluate({ say_a_sentence: { stepId: "say_a_sentence", durationMs: 8000, audio: audio(1, 800) } }).pass).toBe(false);
    expect(CAPTURE_CHECK.evaluate({}).pass).toBeNull();
  });
});
