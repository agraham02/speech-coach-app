import { AppState } from "react-native";
import { getStepsWithStatus } from "../db/stepsRepo";
import { getSessionById, isSessionLive } from "../db/sessionsRepo";
import { getTakeAnalyses } from "../analysis/store";
import { offlineRetryDue } from "../../domain/analysis/progress";
import { requestStep } from "./sessionPipeline";
import { runExclusive } from "./jobQueue";
import { logger } from "../../utils/logger";

// A judged review that couldn't go because the phone had no connection is
// sent again by itself: when the app opens, and each time it comes back to the
// front, for a day and a few times (offlineRetryDue). The person is told in
// the take's status ("No connection, so the review is waiting") and by the
// usual "review ready" toast or notification when it lands. A failure for any
// other reason (over the allowance, signed out, a server error) is not
// retried here: it waits for the person's Retry, which explains what to do.

const MIN_GAP_MS = 15_000;
let lastRun = 0;

export function retryOfflineReviews(): Promise<void> {
  return runExclusive("retry-offline-reviews", async () => {
    const now = Date.now();
    if (now - lastRun < MIN_GAP_MS) return;
    lastRun = now;
    const failed = (await getStepsWithStatus(["failed"])).filter((s) => s.step === "cloud_review");
    // One at a time: each is a network call, and the order is oldest first.
    for (const step of failed) {
      const session = await getSessionById(step.sessionId);
      if (!session || !(await isSessionLive(step.sessionId))) continue;
      const review = (await getTakeAnalyses(step.sessionId)).take_review;
      if (!offlineRetryDue({ step, review, recordedAtMs: Date.parse(session.recordedAt), nowMs: Date.now() })) continue;
      logger.info(`[pipeline] ${step.sessionId}: sending the waiting review again`);
      await requestStep(step.sessionId, "cloud_review").catch((error) => logger.warn(`[pipeline] ${step.sessionId}: the waiting review failed again — ${(error as Error).message}`));
    }
  });
}

// Runs the retry now and every time the app returns to the front. Returns the
// unsubscribe.
export function watchForOfflineReviews(): () => void {
  // A few seconds after launch, so the sign-in has been restored first.
  const first = setTimeout(() => retryOfflineReviews().catch(() => undefined), 4000);
  const sub = AppState.addEventListener("change", (state) => {
    if (state === "active") retryOfflineReviews().catch(() => undefined);
  });
  return () => {
    clearTimeout(first);
    sub.remove();
  };
}
