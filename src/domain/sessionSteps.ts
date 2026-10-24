import type { SessionStatus } from "./sessionTypes";

// Each piece of post-recording analysis is its own independently
// re-runnable step with its own status, error and attempt count. Before
// this, a session had a single `status`, so nothing could resume after the
// app was killed, a later "grade" pass could clobber earlier results, and
// there was no way to retry just one part.
//
// - transcribe:    on-device ASR -> transcript
// - audio_metrics: pitch/volume DSP, fillers, repeated words, WPM curve
// - presence:      face-timeline summary (video analysis, Phase 2)
// - coach:         on-device coaching (Phase 2)
// - cloud_review:  Gemini "deep review" (opt-in)
export type SessionStep = "transcribe" | "audio_metrics" | "presence" | "coach" | "cloud_review";

export type StepStatus = "pending" | "running" | "done" | "failed" | "skipped" | "interrupted";

export interface StepState {
  sessionId: string;
  step: SessionStep;
  status: StepStatus;
  attempts: number;
  lastError: string | null;
  updatedAt: string;
}

export const ALL_STEPS: SessionStep[] = ["transcribe", "audio_metrics", "presence", "coach", "cloud_review"];

export const STEP_LABELS: Record<SessionStep, string> = {
  transcribe: "Transcript",
  audio_metrics: "Voice analysis",
  presence: "Video analysis",
  coach: "Coaching",
  cloud_review: "Tono AI",
};

export function isActive(status: StepStatus | undefined): boolean {
  return status === "pending" || status === "running";
}

// The session-level status shown in History is derived, never stored on
// its own: only a failed *transcript* makes the whole session "error".
// Optional steps (deep review, video analysis…) failing just shows
// as a badge on that step.
export function deriveSessionStatus(steps: Pick<StepState, "step" | "status">[]): SessionStatus {
  const byStep = new Map(steps.map((s) => [s.step, s.status]));
  if (steps.some((s) => isActive(s.status))) return "processing";
  const transcribe = byStep.get("transcribe");
  if (transcribe === "failed" || transcribe === "interrupted") return "error";
  return "done";
}

export interface LegacySessionSignals {
  status: SessionStatus;
  hasTranscript: boolean;
  dspStatus: string | null;
  hasScores: boolean;
  wantsGrading: boolean;
}

// Backfills step rows for sessions recorded before steps existed, from the
// signals the old schema left behind. A row still marked "processing" was
// cut off mid-pipeline (nothing can be running at migration time), so its
// unfinished steps become "interrupted" and reconcile can resume them.
export function inferLegacySteps(s: LegacySessionSignals): { step: SessionStep; status: StepStatus; lastError: string | null }[] {
  const cutOff: StepStatus = s.status === "processing" || s.status === "recording" ? "interrupted" : "failed";
  const unknownError = s.status === "error" ? "Failed before step tracking existed" : null;
  const unfinished = (wanted: boolean): StepStatus => (s.status === "done" ? "skipped" : wanted ? cutOff : "skipped");

  const rows: { step: SessionStep; status: StepStatus; lastError: string | null }[] = [];
  rows.push({
    step: "transcribe",
    status: s.hasTranscript ? "done" : s.status === "done" ? "failed" : cutOff,
    lastError: s.hasTranscript ? null : unknownError,
  });
  rows.push({
    step: "audio_metrics",
    status: s.dspStatus === "complete" ? "done" : s.dspStatus === "failed" ? "failed" : s.hasTranscript ? "skipped" : cutOff,
    lastError: s.dspStatus === "failed" ? "Audio analysis failed" : null,
  });
  rows.push({ step: "presence", status: "skipped", lastError: null });
  rows.push({ step: "coach", status: "skipped", lastError: null });
  rows.push({
    step: "cloud_review",
    status: s.hasScores ? "done" : unfinished(s.wantsGrading),
    lastError: !s.hasScores && s.wantsGrading && s.status === "error" ? unknownError : null,
  });
  return rows;
}
