import { getStepsWithStatus, setStepStatus } from "../db/stepsRepo";
import { getReferencedVideoFiles, getSessionById } from "../db/sessionsRepo";
import { deleteRecording, listSessionFiles } from "../storage/videoStorage";
import { refreshSessionStatus } from "./stepRunner";
import { runPendingSteps } from "./sessionPipeline";
import { backfillSessionScores } from "../sessions/sessionScoreService";
import { logger } from "../../utils/logger";

// Steps resume automatically only for recent sessions and only a few times,
// so a step that crashes the app can't loop forever.
const AUTO_RESUME_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_AUTO_ATTEMPTS = 3;
// Previews younger than this may belong to a take still on the Preview
// screen, so they're never treated as orphans.
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

let reconciled = false;

// Runs once per app launch, after the database is open. Nothing can be
// running at cold start, so any step marked "running" was cut off when the
// app was killed — before this existed, such a session showed an endless
// spinner with no way to retry.
export async function reconcileOnLaunch(): Promise<void> {
  if (reconciled) return;
  reconciled = true;
  try {
    const stale = await getStepsWithStatus(["running"]);
    for (const step of stale) {
      await setStepStatus(step.sessionId, step.step, "interrupted", { lastError: "Interrupted — the app was closed." });
    }

    const resumable = await getStepsWithStatus(["pending", "interrupted"]);
    const sessionIds = [...new Set(resumable.map((s) => s.sessionId))];
    for (const sessionId of sessionIds) {
      await refreshSessionStatus(sessionId);
      const session = await getSessionById(sessionId);
      if (!session || session.deletedAt) continue;
      const recent = Date.now() - Date.parse(session.recordedAt) < AUTO_RESUME_WINDOW_MS;
      const steps = resumable.filter((s) => s.sessionId === sessionId);
      if (recent && steps.every((s) => s.attempts < MAX_AUTO_ATTEMPTS)) {
        logger.info(`[reconcile] resuming ${steps.map((s) => s.step).join(", ")} for ${sessionId}`);
        runPendingSteps(sessionId).catch(() => undefined);
      }
    }
    if (stale.length) logger.info(`[reconcile] marked ${stale.length} interrupted step(s)`);

    await cleanUpOrphanedVideos();
    await backfillSessionScores();
  } catch (error) {
    logger.error(`[reconcile] failed — ${(error as Error).message}`);
  }
}

// Deletes video files no live session references: abandoned previews
// (back-swiped away before Save/Discard) and deleted sessions' files.
async function cleanUpOrphanedVideos(): Promise<void> {
  const referenced = await getReferencedVideoFiles();
  const now = Date.now();
  let removed = 0;
  for (const file of listSessionFiles()) {
    if (referenced.has(file.name)) continue;
    const ageMs = file.modifiedMs != null ? now - file.modifiedMs : Infinity;
    if (ageMs < ORPHAN_MIN_AGE_MS) continue;
    deleteRecording(file.uri);
    removed += 1;
  }
  if (removed) logger.info(`[reconcile] removed ${removed} orphaned video file(s)`);
}
