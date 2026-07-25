import * as Haptics from "expo-haptics";
import { transcribeOnly, transcribeSession, type TranscribeProgressStep } from "../gemini/transcribeSession";
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
import { getPrompt } from "../db/promptsRepo";
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
  wantsGrading: boolean;
  wantsNotionSync: boolean;
}

function progressStepToPhase(step: TranscribeProgressStep): ProcessingPhase {
  if (step === "uploading") return "uploading";
  if (step === "processing") return "processing";
  return "transcribing";
}

// Appends the session's clean transcript to Notion and marks it synced. This
// is the only path to Notion now — called automatically here when the
// session was saved with "Sync to Notion" on, and also callable later as a
// manual retry (see the standalone export below) for any session that
// doesn't have it yet, regardless of why.
export async function syncSessionToNotion(sessionId: string): Promise<void> {
  const session = await getSessionById(sessionId);
  if (!session?.transcriptClean) {
    throw new Error("No transcript to sync yet");
  }
  const prompt = getPrompt(session.promptId);
  await appendTodayTranscript(session.transcriptClean, prompt?.text ?? "");
  await markSessionNotionSynced(sessionId);
  logger.info(`[pipeline] session ${sessionId}: Notion sync complete`);
}

// Runs the full grading rubric (upload -> transcribe -> score) and saves the
// result. Shared by the on-demand "Grade with Gemini" retry path and the
// initial pipeline run below so the two don't drift out of sync.
async function runGradingPass(
  sessionId: string,
  prompt: Prompt,
  videoUri: string,
  emit: (phase: ProcessingPhase, extra?: Partial<{ errorMessage: string }>) => void,
): Promise<ReturnType<typeof analysisToSessionScores>> {
  const analysis = await transcribeSession(videoUri, prompt.text, (step) => emit(progressStepToPhase(step)));
  await updateSessionTranscripts(
    sessionId,
    analysis.transcript_verbatim,
    analysis.transcript_clean,
    analysis.duration_seconds,
  );
  const scores = analysisToSessionScores(sessionId, analysis);
  await upsertScores(scores);
  logger.info(`[pipeline] session ${sessionId}: transcripts + scores saved locally`);
  return scores;
}

// Runs the full grading rubric on a session that was saved without it (e.g. a
// free recording, or any session where "Get AI feedback" was left off).
// Necessarily re-uploads the video — Gemini Files API entries expire after
// 48h (plan.md §10), so there's nothing from an earlier transcript-only call
// to reuse. Emits phase updates via processingEvents so a screen can show progress.
export async function gradeExistingSession(sessionId: string, prompt: Prompt, videoUri: string): Promise<void> {
  const emit = (phase: ProcessingPhase, extra?: Partial<{ errorMessage: string }>) =>
    emitProcessingStatus({ sessionId, phase, ...extra });

  try {
    emit("uploading");
    const scores = await runGradingPass(sessionId, prompt, videoUri, emit);
    logger.info(`[pipeline] session ${sessionId}: graded on demand`);
    emit("done");

    celebrateCompletion(scores.overallScore).catch((err) =>
      logger.error(`[pipeline] session ${sessionId}: celebration feedback failed — ${(err as Error).message}`),
    );
  } catch (error) {
    logger.error(`[pipeline] session ${sessionId}: on-demand grading failed — ${(error as Error).message}`);
    emit("error", { errorMessage: (error as Error).message });
    throw error;
  }
}

// Runs the save -> transcribe(/grade) -> (optionally) Notion pipeline for a
// session, entirely independent of any mounted screen. Call this once
// (fire-and-forget) right after the user chooses "Save" on the Preview
// screen; screens observe progress via processingEvents instead of driving
// it, so navigating away never interrupts the work.
export async function processSession({
  sessionId,
  prompt,
  videoUri,
  durationSecondsLocal,
  wantsGrading,
  wantsNotionSync,
}: ProcessSessionArgs): Promise<void> {
  const emit = (phase: ProcessingPhase, extra?: Partial<{ errorMessage: string }>) =>
    emitProcessingStatus({ sessionId, phase, ...extra });

  try {
    logger.info(
      `[pipeline] session ${sessionId}: starting (prompt="${prompt.text}", grading=${wantsGrading}, notion=${wantsNotionSync})`,
    );
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
        wantsGrading,
        wantsNotionSync,
      });
    } else {
      logger.info(`[pipeline] session ${sessionId}: found existing row (status=${existing.status}), retrying`);
    }

    // For a retry, don't just check that a transcript exists — if grading was
    // requested, the scores row has to exist too. Otherwise a retry after a
    // failure that happened between saving the transcript and upserting
    // scores (e.g. the DB write for scores throwing) would see the transcript
    // already there, skip straight past scoring, and mark the session "done"
    // without ever having graded it.
    const alreadyHasRequiredArtifacts = wantsGrading
      ? !!existing?.transcriptClean && !!(await getScoresBySessionId(sessionId))
      : !!existing?.transcriptClean;

    if (!alreadyHasRequiredArtifacts) {
      if (wantsGrading) {
        await runGradingPass(sessionId, prompt, videoUri, emit);
      } else {
        const transcript = await transcribeOnly(videoUri, (step) => emit(progressStepToPhase(step)));
        await updateSessionTranscripts(
          sessionId,
          transcript.transcript_verbatim,
          transcript.transcript_clean,
          transcript.duration_seconds,
        );
        logger.info(`[pipeline] session ${sessionId}: transcript-only saved locally`);
      }
    } else {
      logger.info(`[pipeline] session ${sessionId}: reusing existing transcripts`);
    }

    if (wantsNotionSync) {
      emit("saving_notion");
      try {
        await syncSessionToNotion(sessionId);
      } catch (notionError) {
        // Never a session-level failure — just left unsynced and retriable
        // later from the Result screen. Still surface it, though, since this
        // runs in the background and nothing else would tell the user.
        logger.error(`[pipeline] session ${sessionId}: Notion sync failed — ${(notionError as Error).message}`);
        showGlobalToast(`Saved locally — Notion sync failed (${(notionError as Error).message})`, "error");
      }
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
    emit("error", { errorMessage: (error as Error).message });
  }
}
