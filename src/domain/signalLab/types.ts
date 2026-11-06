import type { FaceCalibration } from "../faceCalibration";
import type { AudioFeatures } from "../dsp/audioFeatures";
import type { VoiceLabSummary } from "../dev/voiceLab";
import type { PresenceSample } from "../presenceMetrics";
import type { TranscriptWord } from "../sessionTypes";

// Signal Lab (docs/overhaul/PLAN.md, section 6.5): a Dev-tab suite that tests
// whether each reading can be trusted. A test is a short script of steps. The
// runner records each step through the same capture path as the real feature,
// turns it into a StepMeasure, and the test's evaluator checks the numbers
// against the pass bar. Everything here is pure data, so evaluators are unit
// tested with made-up measures and no phone.

export type LabGroup = "setup" | "voice" | "clarity" | "presence" | "content";

export const LAB_GROUP_LABELS: Record<LabGroup, string> = {
  setup: "Check the lab",
  voice: "Voice",
  clarity: "Clarity",
  presence: "Presence",
  content: "Content",
};

// What the runner captures for a step.
//  take      record video and audio like a real take; analyse the audio
//  face      the live camera's face timeline only (no recording)
//  face_take a take with the face timeline running beside it, like a real take
//  none      nothing captured: the test runs on stored cases
export type LabCapture = "take" | "face" | "face_take" | "none";

export interface LabStep {
  id: string;
  title: string;
  // What to do, in one or two plain sentences.
  instruction: string;
  // Words to read aloud, when the step has a script.
  script?: string;
  // How long to record or watch.
  seconds: number;
  capture: LabCapture;
  // Also transcribe the clip with Whisper (word times): for pace, pauses at
  // marks, fillers, word stress.
  words?: boolean;
  // The person times themselves: the runner shows Start and Stop buttons, recording runs the whole time, and the time between the taps becomes the step's stopwatchMs.
  stopwatch?: boolean;
  // Cues shown on screen at set times, for steps that ask for something to
  // happen on cue (a brow lift, a long look away).
  cues?: { atMs: number; label: string }[];
  // Run the clip through every available transcription engine, for the
  // recognizer vs Whisper test.
  engines?: boolean;
}

export interface LabTestDef {
  // "voice.pitch_variety": the group, a dot, a snake-case name.
  id: string;
  group: LabGroup;
  title: string;
  summary: string;
  // About how long the whole test takes, for "Run all".
  minutes: number;
  steps: LabStep[];
  // The pass bars, one plain line each (shown before and after the run).
  bars: string[];
  // What happens to the reading if the test fails (the plan's last column).
  onFail: string;
  // Set when the test can't run yet, and why.
  blockedBy?: string;
}

// What one step produced after analysis. Which fields are set depends on the
// step's capture and options.
export interface StepMeasure {
  stepId: string;
  durationMs: number;
  // The audio extractor's track for the clip and its summary numbers.
  audio?: { features: AudioFeatures; summary: VoiceLabSummary };
  // Whisper's words for the clip, when the step asked for them.
  words?: TranscriptWord[];
  // The face timeline, for face and face_take steps.
  face?: PresenceSample[];
  // The face check this person did, if any. Real takes are scored through it,
  // so the tests are too.
  faceCalibration?: FaceCalibration | null;
  // The face's width as a share of the frame, averaged over the step. Moving
  // closer makes this larger, which is how the distance test corrects.
  faceWidth?: number;
  // A wall-clock time something took (a stopwatch the person ran, or how long
  // Whisper took on this clip).
  stopwatchMs?: number;
  // The same clip through each transcription engine, for the recognizer vs
  // Whisper test.
  engines?: Record<string, { text: string; words: TranscriptWord[] | null; ms: number }>;
  // The cues that were on screen and when, in step time.
  cues?: { tMs: number; label: string }[];
}

export type StepMeasures = Record<string, StepMeasure | undefined>;

export interface LabCheck {
  label: string;
  // The measured value, as text ("3.1 semitones", "82%").
  value: string;
  // null: shown for information, doesn't decide the test.
  pass: boolean | null;
  // The bar this was held to, in words ("under 2.5 semitones").
  bar?: string;
}

export interface LabOutcome {
  // null: not enough was captured to say.
  pass: boolean | null;
  checks: LabCheck[];
  // One sentence for the result card.
  summary: string;
  // The raw numbers, for the export.
  numbers: Record<string, number | string | boolean | null>;
}

export interface LabTestEntry {
  def: LabTestDef;
  // Pure: the same measures always give the same outcome.
  evaluate: (measures: StepMeasures) => LabOutcome;
}

// One stored run of a test.
export interface LabResult {
  testId: string;
  at: string;
  appVersion: string;
  extractorVersion: string;
  thresholdsVersion: number;
  outcome: LabOutcome;
  // What the person wrote about the run ("phone on a stand", "noisy room").
  note?: string;
}

// Where a test stands, from its stored runs.
export type LabStatus = "not_run" | "pass" | "fail" | "unclear" | "blocked";
