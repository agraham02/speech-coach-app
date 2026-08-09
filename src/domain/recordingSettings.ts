export type DurationMode = "fixed" | "random";

export interface RecordingDurationSettings {
  mode: DurationMode;
  fixedSeconds: number;
}

export interface PrepPhaseSettings {
  enabled: boolean;
  mode: DurationMode;
  fixedSeconds: number;
}

// Recording length: 1-5 minutes, in 1-minute steps.
export const RECORDING_DURATION_MIN_SECONDS = 60;
export const RECORDING_DURATION_MAX_SECONDS = 300;
export const RECORDING_DURATION_STEP_SECONDS = 60;
export const DEFAULT_RECORDING_DURATION_SETTINGS: RecordingDurationSettings = {
  mode: "fixed",
  fixedSeconds: 180,
};

// Concise Mode: a separate, opt-in hard-cutoff drill for practicing fitting a
// point into a tight window — 15-60 seconds, in 15-second steps. Distinct
// from the general recording-length setting above: shorter is the point
// here (a constraint to practice against), not a duration preference.
export const CONCISE_DURATION_MIN_SECONDS = 15;
export const CONCISE_DURATION_MAX_SECONDS = 60;
export const CONCISE_DURATION_STEP_SECONDS = 15;
export const DEFAULT_CONCISE_DURATION_SECONDS = 45;

// Prep/brainstorm phase: 10-60 seconds, in 10-second steps.
export const PREP_DURATION_MIN_SECONDS = 10;
export const PREP_DURATION_MAX_SECONDS = 60;
export const PREP_DURATION_STEP_SECONDS = 10;
export const DEFAULT_PREP_PHASE_SETTINGS: PrepPhaseSettings = {
  enabled: false,
  mode: "fixed",
  fixedSeconds: 30,
};

// Picks a uniformly-random value within [min, max], snapped to step.
function randomStepValue(min: number, max: number, step: number): number {
  const stepCount = Math.round((max - min) / step);
  const randomStepIndex = Math.floor(Math.random() * (stepCount + 1));
  return min + randomStepIndex * step;
}

export function resolveRecordingDurationSeconds(settings: RecordingDurationSettings): number {
  return settings.mode === "random"
    ? randomStepValue(RECORDING_DURATION_MIN_SECONDS, RECORDING_DURATION_MAX_SECONDS, RECORDING_DURATION_STEP_SECONDS)
    : settings.fixedSeconds;
}

export function resolvePrepDurationSeconds(settings: PrepPhaseSettings): number {
  return settings.mode === "random"
    ? randomStepValue(PREP_DURATION_MIN_SECONDS, PREP_DURATION_MAX_SECONDS, PREP_DURATION_STEP_SECONDS)
    : settings.fixedSeconds;
}
