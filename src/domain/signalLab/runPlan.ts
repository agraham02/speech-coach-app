import type { LabOutcome, LabResult, LabStep, StepMeasure } from "./types";

// The pure parts of running a test: when each cue shows, how long a step runs,
// and what a finished run becomes. The runner screen drives the camera and
// calls these. Pure.

// A cue stays on screen this long after its time.
export const CUE_WINDOW_MS = 3000;
// A little before and after a timed step so nothing is clipped.
export const STEP_TAIL_MS = 400;

export function stepDurationMs(step: LabStep): number {
  return Math.max(1, step.seconds) * 1000;
}

// The cue to show at `elapsedMs`: the latest one whose time has come, while it
// is still inside its window.
export function currentCue(step: LabStep, elapsedMs: number): { atMs: number; label: string } | null {
  const cues = step.cues ?? [];
  let found: { atMs: number; label: string } | null = null;
  for (const cue of cues) if (cue.atMs <= elapsedMs && (!found || cue.atMs > found.atMs)) found = cue;
  return found && elapsedMs - found.atMs <= CUE_WINDOW_MS ? found : null;
}

// The cues as the measures record them: the schedule, since each is shown at
// its time.
export function cueSchedule(step: LabStep): NonNullable<StepMeasure["cues"]> {
  return (step.cues ?? []).map((c) => ({ tMs: c.atMs, label: c.label }));
}

// The countdown shown while a timed step runs, in whole seconds, never below 0.
export function secondsLeft(step: LabStep, elapsedMs: number): number {
  return Math.max(0, Math.ceil((stepDurationMs(step) - elapsedMs) / 1000));
}

export interface RunVersions {
  appVersion: string;
  extractorVersion: string;
  thresholdsVersion: number;
}

export function makeResult(testId: string, outcome: LabOutcome, versions: RunVersions, now: Date = new Date()): LabResult {
  return { testId, at: now.toISOString(), ...versions, outcome };
}

// What an evaluator that threw looks like in the results: unclear, with the
// reason, so a bug in a test never reads as a pass or a fail.
export function failedEvaluation(error: unknown): LabOutcome {
  const message = error instanceof Error ? error.message : String(error);
  return { pass: null, checks: [], summary: `The test couldn't be evaluated: ${message}`, numbers: {} };
}
