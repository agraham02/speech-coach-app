import type { SessionStep } from "../sessionSteps";
import type { WorkSummary } from "./progress";

// The words on every waiting state, in one place (so the voice stays one
// voice, and session 02's copy pass has a single file to read). In-app text
// only: the lock-screen notifications are in domain/notificationCopy.ts.

// What each step is doing, as the present-tense line a person reads.
export const ACTIVITY: Record<SessionStep, string> = {
  transcribe: "Writing out your words",
  audio_metrics: "Measuring pace, pauses and pitch",
  presence: "Reading your face and gaze",
  coach: "Working out what to try next",
  cloud_review: "Your AI coach is reviewing it",
};

// The one-line state of a take's work.
export function workHeadline(w: WorkSummary): string {
  switch (w.phase) {
    case "queued":
      return "Waiting for its turn";
    case "running":
      return w.current ? `Step ${w.position} of ${w.total}: ${ACTIVITY[w.current]}` : "Working on it";
    case "attention":
      return w.problems.length === 1 ? "One part didn't finish" : "Some parts didn't finish";
    case "done":
      return "All done";
    default:
      return "";
  }
}

// What the person can do meanwhile, and what happens if they leave. Plain
// about the limits: the phone's own steps need the app open.
export function workReassurance(w: WorkSummary): string {
  if (w.phase === "attention") return "Nothing is lost. Try again when you're ready.";
  if (w.review === "running" || w.review === "queued") {
    return w.onDevice === "done" ? "Your numbers are in. You can leave this screen; the review lands here when it's ready." : "You can leave this screen. If you close the app, it picks up where it left off next time you open it.";
  }
  return "You can leave this screen. If you close the app, it picks up where it left off next time you open it.";
}

// The review line, when the review is the part that isn't in.
export function reviewLine(w: WorkSummary): string | null {
  if (w.reviewWaitsForConnection) return "No connection, so the review is waiting. It sends itself when you're back online.";
  switch (w.review) {
    case "queued":
      return "Your AI coach's review is next.";
    case "running":
      return "Your AI coach is reviewing it.";
    case "failed": {
      const line = w.lines.find((l) => l.step === "cloud_review");
      return line?.message ?? "The review didn't come through.";
    }
    default:
      return null;
  }
}

// The starting point's wait screen.
export const STARTING_POINT = {
  title: "Putting your starting point together",
  detail: "Your numbers come from your recording, measured on this phone. Your AI coach's read is added when it's in.",
  skip: "Continue without the AI coach",
  skipDetail: "Your starting point uses what the phone measured. The AI coach's read stays on the talk, in your Library.",
} as const;
