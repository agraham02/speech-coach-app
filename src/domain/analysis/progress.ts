import type { SessionStep, StepState, StepStatus } from "../sessionSteps";

// The one state model for "something is being worked out for this take".
// Every waiting screen (Result, the starting point, Today's pending card, the
// Library) reads the same summary instead of inventing its own spinner logic.
//
// The truth lives in the database (session_steps, plus the take's analysis
// record from services/analysis/store.ts); this only reads it. Nothing here
// touches the app, so it is tested on its own (analysisProgress.test.ts).

export type WorkPhase =
  // No steps for this take (or all skipped).
  | "idle"
  // Steps are waiting for their turn and none has started.
  | "queued"
  // At least one step is running; others may be waiting behind it.
  | "running"
  // Everything asked for has finished.
  | "done"
  // Nothing is running and something failed or was cut off: needs the person.
  | "attention";

// The judged review is its own line: it is the slow one, it needs the
// network, and it can fail without the take being any less useful.
export type ReviewPhase = "none" | "queued" | "running" | "done" | "failed";

export interface StepLine {
  step: SessionStep;
  status: StepStatus;
  // For failed/interrupted steps: the sentence to show.
  message: string | null;
}

export interface WorkSummary {
  phase: WorkPhase;
  // The steps that count (skipped ones don't), in pipeline order.
  lines: StepLine[];
  total: number;
  finished: number;
  // The step being worked on now, else the next one waiting.
  current: SessionStep | null;
  // 1-based place of `current` among the counted steps (0 when none).
  position: number;
  // The phone's own steps (everything but the review) and the review.
  onDevice: Exclude<WorkPhase, "idle">;
  review: ReviewPhase;
  // The review failed because there was no connection: it is waiting to be
  // sent again by itself (retryOfflineReviews), so no button is needed.
  reviewWaitsForConnection: boolean;
  // Steps that failed or were cut off, with the sentence for each.
  problems: StepLine[];
}

// The take's analysis record for the judged review, as the AnalysisService
// stores it (a slice of services/analysis/store.ts StoredAnalysis).
export interface ReviewRecord {
  status: "done" | "pending" | "unavailable";
  reason?: string;
}

const REVIEW_STEP: SessionStep = "cloud_review";

const isStuck = (status: StepStatus) => status === "failed" || status === "interrupted";

export function summarizeWork(steps: Pick<StepState, "step" | "status" | "lastError">[], review?: ReviewRecord | null): WorkSummary {
  const lines: StepLine[] = steps
    .filter((s) => s.status !== "skipped")
    .map((s) => ({ step: s.step, status: s.status, message: isStuck(s.status) ? s.lastError : null }));

  const running = lines.some((l) => l.status === "running");
  const waiting = lines.some((l) => l.status === "pending");
  const stuck = lines.filter((l) => isStuck(l.status));
  const finished = lines.filter((l) => l.status === "done").length;

  // A cut-off step behind a running one is just waiting its turn: the
  // pipeline picks interrupted steps up in order after a relaunch.
  let phase: WorkPhase;
  if (lines.length === 0) phase = "idle";
  else if (running) phase = "running";
  else if (waiting) phase = "queued";
  else if (stuck.length) phase = "attention";
  else phase = "done";

  const currentLine = lines.find((l) => l.status === "running") ?? lines.find((l) => l.status === "pending") ?? lines.find((l) => isStuck(l.status));
  const current = phase === "done" || phase === "idle" ? null : currentLine?.step ?? null;
  const position = current ? lines.findIndex((l) => l.step === current) + 1 : 0;

  const phoneLines = lines.filter((l) => l.step !== REVIEW_STEP);
  const onDevice = onDevicePhase(phoneLines);

  const reviewLine = lines.find((l) => l.step === REVIEW_STEP);
  let reviewPhase: ReviewPhase = "none";
  if (reviewLine) {
    if (reviewLine.status === "running") reviewPhase = "running";
    else if (reviewLine.status === "pending") reviewPhase = "queued";
    else if (reviewLine.status === "done") reviewPhase = "done";
    else reviewPhase = "failed";
  }

  // A cut-off review is not "waiting for a connection"; only a refusal for
  // lack of one is.
  const reviewWaitsForConnection = reviewPhase === "failed" && reviewLine?.status === "failed" && review?.status === "unavailable" && review.reason === "offline";

  return {
    phase,
    lines,
    total: lines.length,
    finished,
    current,
    position,
    onDevice,
    review: reviewPhase,
    reviewWaitsForConnection,
    problems: stuck,
  };
}

function onDevicePhase(lines: StepLine[]): Exclude<WorkPhase, "idle"> {
  if (lines.some((l) => l.status === "running")) return "running";
  if (lines.some((l) => l.status === "pending")) return "queued";
  if (lines.some((l) => isStuck(l.status))) return "attention";
  return "done";
}

// --- How long it takes ------------------------------------------------------

// Seconds a step takes, as a [low, high] range, from the pipeline timings the
// app logs ("[pipeline] <id> <step>: done in N s") on three real iPhone takes
// (analysis_samples, 41 s to 89 s long): the phone's steps together took
// about 0.2 to 0.25 x the length of the talk, split roughly 60% transcript,
// 30% voice, 8% coaching. The review has only been timed on the old
// watch-the-video path (92 s and 4 min with a retry for two takes; one failed
// after 78 s). The default now is a text-only call, which has NOT been timed
// on a phone: its range is an estimate, and the device test plan asks for the
// real numbers. Update RANGES from those.
export interface EtaContext {
  takeSeconds: number;
  // What the judged review reads, if one is coming.
  reviewInput: "text" | "video" | null;
}

export const REVIEW_SECONDS: Record<"text" | "video", [number, number]> = {
  text: [4, 25],
  video: [45, 180],
};

const PHONE_WEIGHT: Partial<Record<SessionStep, number>> = { transcribe: 0.6, audio_metrics: 0.3, presence: 0.02, coach: 0.08 };

export function stepSeconds(step: SessionStep, ctx: EtaContext): [number, number] {
  if (step === REVIEW_STEP) return REVIEW_SECONDS[ctx.reviewInput ?? "text"];
  const weight = PHONE_WEIGHT[step] ?? 0.05;
  const lo = (0.12 * ctx.takeSeconds + 2) * weight;
  const hi = (0.35 * ctx.takeSeconds + 6) * weight;
  return [Math.max(0.3, lo), Math.max(1, hi)];
}

// What is still to do, in seconds as a range. A running step counts in full
// (no way to know how far along it is), so the estimate can only be on the
// long side while it runs.
export function remainingSeconds(w: WorkSummary, ctx: EtaContext): [number, number] {
  let lo = 0;
  let hi = 0;
  for (const line of w.lines) {
    if (line.status !== "pending" && line.status !== "running" && !(w.phase === "running" && isStuck(line.status))) continue;
    const [a, b] = stepSeconds(line.step, ctx);
    lo += a;
    hi += b;
  }
  return [lo, hi];
}

// An honest sentence about time: a range or a ceiling, never a made-up
// countdown. Past the top of the range it says so instead of repeating it.
export function etaSentence(range: [number, number], elapsedSeconds: number): string {
  const [lo, hi] = range;
  if (elapsedSeconds > hi * 1.5 + 10) return "Taking longer than usual. You can leave; it keeps going.";
  if (hi <= 12) return "A few seconds.";
  if (hi <= 35) return "Usually under half a minute.";
  if (hi <= 70) return "Usually about a minute or less.";
  const a = Math.max(1, Math.round(lo / 60));
  const b = Math.max(a + 1, Math.ceil(hi / 60));
  return `Usually ${a} to ${b} minutes.`;
}

// --- After the app was closed ----------------------------------------------

// Steps resume automatically only for recent takes and only a few times, so a
// step that crashes the app can't loop forever (the same rule reconcile.ts
// applied inline before).
export const AUTO_RESUME_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_AUTO_ATTEMPTS = 3;

export type ResumeDecision = "resume" | "leave";

// What launch does with a take whose steps were pending or cut off.
export function resumeDecision(steps: Pick<StepState, "attempts">[], recordedAtMs: number, nowMs: number): ResumeDecision {
  const recent = nowMs - recordedAtMs < AUTO_RESUME_WINDOW_MS;
  return recent && steps.every((s) => s.attempts < MAX_AUTO_ATTEMPTS) ? "resume" : "leave";
}

// A review that couldn't go because the phone was offline is sent again when
// the app is opened or comes back to the front, for a day, a few times.
export const OFFLINE_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_OFFLINE_RETRIES = 5;

export function offlineRetryDue(input: { step: Pick<StepState, "status" | "attempts">; review: ReviewRecord | null | undefined; recordedAtMs: number; nowMs: number }): boolean {
  const { step, review, recordedAtMs, nowMs } = input;
  if (step.status !== "failed") return false;
  if (review?.status !== "unavailable" || review.reason !== "offline") return false;
  if (nowMs - recordedAtMs > OFFLINE_RETRY_WINDOW_MS) return false;
  return step.attempts < MAX_OFFLINE_RETRIES;
}
