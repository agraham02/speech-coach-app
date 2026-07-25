import * as Haptics from "expo-haptics";
import { transcribeSession, type TranscribeProgressStep } from "../gemini/transcribeSession";
import { appendTodayTranscript } from "../notion/appendTodayTranscript";
import {
  getSessionById,
  insertSession,
  markSessionNotionSynced,
  updateSessionStatus,
  updateSessionTranscripts,
} from "../db/sessionsRepo";
import { getCompletedSessionDates } from "../db/statsRepo";
import { analysisToSessionScores, getScoresBySessionId, upsertScores } from "../db/scoresRepo";
import { emitProcessingStatus, type ProcessingPhase } from "./processingEvents";
import { showGlobalToast } from "../../components/common/ToastProvider";
import { computeStreaks } from "../../domain/streaks";
import { logger } from "../../utils/logger";
import type { Prompt } from "../../domain/sessionTypes";

// Fires regardless of which screen (if any) is currently open, since this
// runs from the background pipeline, not a mounted screen.
async function celebrateCompletion(overallScore: number): Promise<void> {
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  showGlobalToast(`Session graded — overall ${overallScore}/10`, "success");

  const dates = await getCompletedSessionDates();
  const { currentStreak, longestStreak } = computeStreaks(dates);
  if (currentStreak >= 2 && currentStreak === longestStreak) {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showGlobalToast(`🔥 ${currentStreak} day streak!`, "success");
  }
}

export interface ProcessSessionArgs {
  sessionId: string;
  prompt: Prompt;
  videoUri: string;
  durationSecondsLocal: number;
}

function progressStepToPhase(step: TranscribeProgressStep): ProcessingPhase {
  if (step === "uploading") return "uploading";
  if (step === "processing") return "processing";
  return "transcribing";
}

// Runs the full save -> transcribe/grade -> Notion pipeline for a session,
// entirely independent of any mounted screen. Call this once (fire-and-forget)
// right after a recording finishes; screens observe progress via
// processingEvents instead of driving it, so navigating away never
// interrupts the work.
export async function processSession({ sessionId, prompt, videoUri, durationSecondsLocal }: ProcessSessionArgs): Promise<void> {
  const emit = (phase: ProcessingPhase, extra?: Partial<{ errorMessage: string; notionFailedOnly: boolean }>) =>
    emitProcessingStatus({ sessionId, phase, ...extra });

  try {
    logger.info(`[pipeline] session ${sessionId}: starting (target prompt="${prompt.text}")`);
    emit("saving_locally");
    const existing = await getSessionById(sessionId);
    if (!existing) {
      logger.info(`[pipeline] session ${sessionId}: inserting new row`);
      await insertSession({
        id: sessionId,
        promptId: prompt.id,
        recordedAt: new Date().toISOString(),
        videoPath: videoUri,
        durationSeconds: durationSecondsLocal,
        transcriptionSource: "gemini",
        transcriptVerbatim: null,
        transcriptClean: null,
        status: "processing",
        notionSyncedAt: null,
      });
    } else {
      logger.info(`[pipeline] session ${sessionId}: found existing row (status=${existing.status}), retrying`);
    }

    let cleanTranscript = existing?.transcriptClean;

    if (!cleanTranscript) {
      const analysis = await transcribeSession(videoUri, prompt.text, (step) => emit(progressStepToPhase(step)));
      await updateSessionTranscripts(
        sessionId,
        analysis.transcript_verbatim,
        analysis.transcript_clean,
        analysis.duration_seconds,
      );
      await upsertScores(analysisToSessionScores(sessionId, analysis));
      logger.info(`[pipeline] session ${sessionId}: transcripts + scores saved locally`);
      cleanTranscript = analysis.transcript_clean;
    } else {
      logger.info(`[pipeline] session ${sessionId}: reusing existing transcripts/scores (retry after Notion-only failure)`);
    }

    emit("saving_notion");
    try {
      await appendTodayTranscript(cleanTranscript, prompt.text);
      await markSessionNotionSynced(sessionId);
      logger.info(`[pipeline] session ${sessionId}: Notion sync complete`);
    } catch (notionError) {
      // Session + transcripts are already saved locally — Notion is the only
      // thing that failed, so surface that distinctly rather than as a full failure.
      logger.error(`[pipeline] session ${sessionId}: Notion sync failed — ${(notionError as Error).message}`);
      await updateSessionStatus(sessionId, "done");
      emit("error", { errorMessage: (notionError as Error).message, notionFailedOnly: true });
      return;
    }

    await updateSessionStatus(sessionId, "done");
    logger.info(`[pipeline] session ${sessionId}: done`);
    emit("done");

    const scores = await getScoresBySessionId(sessionId);
    if (scores) {
      celebrateCompletion(scores.overallScore).catch((err) =>
        logger.error(`[pipeline] session ${sessionId}: celebration feedback failed — ${(err as Error).message}`),
      );
    }
  } catch (error) {
    logger.error(`[pipeline] session ${sessionId}: failed — ${(error as Error).message}`);
    await updateSessionStatus(sessionId, "error").catch(() => undefined);
    emit("error", { errorMessage: (error as Error).message, notionFailedOnly: false });
  }
}
