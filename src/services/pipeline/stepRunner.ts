import { deriveSessionStatus, STEP_LABELS, type SessionStep } from "../../domain/sessionSteps";
import { getSessionSteps, setStepStatus } from "../db/stepsRepo";
import { updateSessionDerivedStatus } from "../db/sessionsRepo";
import { describeGeminiError } from "../gemini/describeError";
import { notifySessionComplete } from "../notifications/sessionCompleteNotifier";
import { emitStepEvent } from "./processingEvents";
import { runExclusive } from "./jobQueue";
import { logger } from "../../utils/logger";

// A step failure the user should read as-is (e.g. "No transcript yet").
export class StepError extends Error {}

function describeStepError(error: unknown): string {
  if (error instanceof StepError) return error.message;
  return describeGeminiError(error);
}

// Recomputes sessions.status from its steps (the session-level status is
// always derived — see domain/sessionSteps.ts).
export async function refreshSessionStatus(sessionId: string): Promise<void> {
  const steps = await getSessionSteps(sessionId);
  const failed = steps.find((s) => s.status === "failed" && s.lastError);
  await updateSessionDerivedStatus(sessionId, deriveSessionStatus(steps), failed?.lastError ?? null);
}

// Runs one step under a per-(session, step) lock: marks it running, runs it,
// then persists done/failed with a readable error. Never throws — returns
// whether the step succeeded, so a chain of steps can keep going.
export function runStep(sessionId: string, step: SessionStep, task: () => Promise<void>): Promise<boolean> {
  return runExclusive(`${sessionId}:${step}`, async () => {
    await setStepStatus(sessionId, step, "running", { bumpAttempts: true });
    emitStepEvent({ sessionId, step, status: "running" });
    await refreshSessionStatus(sessionId);
    try {
      await task();
      await setStepStatus(sessionId, step, "done");
      emitStepEvent({ sessionId, step, status: "done" });
      logger.info(`[pipeline] ${sessionId} ${step}: done`);
      return true;
    } catch (error) {
      const message = describeStepError(error);
      logger.error(`[pipeline] ${sessionId} ${step}: failed — ${(error as Error)?.message ?? error}`);
      await setStepStatus(sessionId, step, "failed", { lastError: message });
      emitStepEvent({ sessionId, step, status: "failed", errorMessage: message });
      // Only shows when the app is backgrounded (the Result screen shows it
      // otherwise) — failures used to be completely silent there.
      notifySessionComplete(sessionId, `${STEP_LABELS[step]} failed`, `${message} Tap to retry.`).catch(() => undefined);
      return false;
    } finally {
      await refreshSessionStatus(sessionId).catch(() => undefined);
    }
  });
}
