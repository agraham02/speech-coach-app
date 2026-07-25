import { transcribeSession, type TranscribeProgressStep } from "../gemini/transcribeSession";
import { appendTodayTranscript } from "../notion/appendTodayTranscript";
import {
  getSessionById,
  insertSession,
  markSessionNotionSynced,
  updateSessionStatus,
  updateSessionTranscripts,
} from "../db/sessionsRepo";
import { emitProcessingStatus, type ProcessingPhase } from "./processingEvents";
import { logger } from "../../utils/logger";
import type { Prompt } from "../../domain/sessionTypes";

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

// Runs the full save -> transcribe -> Notion pipeline for a session, entirely
// independent of any mounted screen. Call this once (fire-and-forget) right
// after a recording finishes; screens observe progress via processingEvents
// instead of driving it, so navigating away never interrupts the work.
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

    let transcripts = existing?.transcriptClean
      ? {
          transcript_verbatim: existing.transcriptVerbatim ?? "",
          transcript_clean: existing.transcriptClean,
          duration_seconds: existing.durationSeconds,
        }
      : null;

    if (!transcripts) {
      transcripts = await transcribeSession(videoUri, prompt.text, (step) => emit(progressStepToPhase(step)));
      await updateSessionTranscripts(
        sessionId,
        transcripts.transcript_verbatim,
        transcripts.transcript_clean,
        transcripts.duration_seconds,
      );
      logger.info(`[pipeline] session ${sessionId}: transcripts saved locally`);
    } else {
      logger.info(`[pipeline] session ${sessionId}: reusing existing transcripts (retry after Notion-only failure)`);
    }

    emit("saving_notion");
    try {
      await appendTodayTranscript(transcripts.transcript_clean, prompt.text);
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
  } catch (error) {
    logger.error(`[pipeline] session ${sessionId}: failed — ${(error as Error).message}`);
    await updateSessionStatus(sessionId, "error").catch(() => undefined);
    emit("error", { errorMessage: (error as Error).message, notionFailedOnly: false });
  }
}
