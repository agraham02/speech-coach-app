import * as Haptics from "expo-haptics";
import { transcribeOnly, transcribeSession, type GradingContext, type TranscribeProgressStep } from "../gemini/transcribeSession";
import { describeGeminiError } from "../gemini/describeError";
import { appendTodayTranscript } from "../notion/appendTodayTranscript";
import { describeNotionError } from "../notion/describeError";
import {
  getSessionById,
  insertSession,
  markSessionNotionSynced,
  updateSessionFillerStats,
  updateSessionStatus,
  updateSessionTranscripts,
} from "../db/sessionsRepo";
import { computeFillerStats } from "../../domain/transcriptAnnotations";
import { getCompletedSessionDates } from "../db/statsRepo";
import { analysisToSessionScores, getScoresBySessionId, upsertScores } from "../db/scoresRepo";
import { getPrompt } from "../db/promptsRepo";
import { getScriptById } from "../db/scriptsRepo";
import { isFreeRecordPrompt } from "../../data/topics";
import { emitProcessingStatus, type ProcessingPhase } from "./processingEvents";
import { showGlobalToast } from "../../components/common/ToastProvider";
import { notifySessionComplete } from "../notifications/sessionCompleteNotifier";
import { syncDailyReminder } from "../notifications/reminderScheduler";
import { navigationRef } from "../../navigation/navigationRef";
import { computeStreaks, streakMilestoneReached } from "../../domain/streaks";
import { logger } from "../../utils/logger";
import type { RecordingSubject, Session, SessionType } from "../../domain/sessionTypes";

function subjectToGradingContext(subject: RecordingSubject): GradingContext {
  return subject.kind === "script"
    ? { kind: "script", script: subject.script, cuesEnabled: subject.cuesEnabled }
    : { kind: "prompt", promptText: subject.prompt.text };
}

function subjectToPromptId(subject: RecordingSubject): string {
  return subject.kind === "script" ? subject.script.id : subject.prompt.id;
}

function subjectToSessionType(subject: RecordingSubject): SessionType {
  if (subject.kind === "script") return "script_practice";
  return isFreeRecordPrompt(subject.prompt.id) ? "free_record" : "spontaneous";
}

// Rebuilds a GradingContext for a previously-saved session (the "Grade with
// Gemini" retry path from Result screen) — unlike the initial pipeline run,
// there's no RecordingSubject from navigation params here, just the DB row.
export async function sessionToGradingContext(session: Session): Promise<GradingContext | null> {
  if (session.sessionType === "script_practice") {
    const script = session.scriptId ? getScriptById(session.scriptId) : undefined;
    if (!script) return null;
    return { kind: "script", script, cuesEnabled: session.cuesEnabled ?? false };
  }
  const prompt = getPrompt(session.promptId);
  if (!prompt) return null;
  return { kind: "prompt", promptText: prompt.text };
}

// Rebuilds a full RecordingSubject for a previously-saved session (History's
// "reopen an in-progress/errored session" path, which needs to hand a
// ProcessSessionArgs-shaped subject to the Processing screen for retrying) —
// same idea as sessionToGradingContext above, but keeps the full Prompt/Script
// object rather than just the text Gemini needs.
export function sessionToRecordingSubject(session: Session): RecordingSubject | null {
  if (session.sessionType === "script_practice") {
    const script = session.scriptId ? getScriptById(session.scriptId) : undefined;
    if (!script) return null;
    return { kind: "script", script, cuesEnabled: session.cuesEnabled ?? false };
  }
  const prompt = getPrompt(session.promptId);
  if (!prompt) return null;
  return { kind: "prompt", prompt };
}

function goToResult(sessionId: string): void {
  if (navigationRef.isReady()) {
    navigationRef.navigate("Result", { sessionId });
  }
}

// Fires regardless of which screen (if any) is currently open, since this
// runs from the background pipeline, not a mounted screen. Tapping the toast
// (rather than the completion itself) is the only thing that navigates —
// see processSession/gradeExistingSession, which never navigate on their own.
async function celebrateCompletion(sessionId: string, overallScore: number): Promise<void> {
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  const title = "Session graded";
  const body = `Overall ${overallScore}/10 — tap to view.`;
  showGlobalToast(`${title} — overall ${overallScore}/10`, "success", () => goToResult(sessionId));
  notifySessionComplete(sessionId, title, body).catch((err) =>
    logger.error(`[pipeline] session ${sessionId}: completion notification failed — ${(err as Error).message}`),
  );

  const dates = await getCompletedSessionDates();
  const { currentStreak, longestStreak } = computeStreaks(dates);
  const milestone = streakMilestoneReached(currentStreak);
  if (milestone) {
    // A fixed-day-count milestone (3/7/14/30/...) is a bigger moment than an
    // ordinary personal best, so it gets its own message instead of the
    // generic "new streak" toast below.
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showGlobalToast(`🏆 ${milestone}-day streak milestone!`, "success");
  } else if (currentStreak >= 2 && currentStreak === longestStreak) {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showGlobalToast(`🔥 ${currentStreak} day streak!`, "success");
  }
}

export type ProcessSessionArgs = RecordingSubject & {
  sessionId: string;
  videoUri: string;
  durationSecondsLocal: number;
  wantsGrading: boolean;
  wantsNotionSync: boolean;
};

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
  context: GradingContext,
  videoUri: string,
  emit: (phase: ProcessingPhase, extra?: Partial<{ errorMessage: string }>) => void,
): Promise<ReturnType<typeof analysisToSessionScores>> {
  const analysis = await transcribeSession(videoUri, context, (step) => emit(progressStepToPhase(step)));
  await updateSessionTranscripts(
    sessionId,
    analysis.transcript_verbatim,
    analysis.transcript_clean,
    analysis.duration_seconds,
  );
  await persistFillerStats(sessionId, analysis.transcript_verbatim, analysis.duration_seconds);
  const scores = analysisToSessionScores(sessionId, analysis);
  await upsertScores(scores);
  logger.info(`[pipeline] session ${sessionId}: transcripts + scores saved locally`);
  return scores;
}

// Deterministic, on-device — runs for every session right after a transcript
// exists, independent of whether Gemini's grading happened to notice fillers.
async function persistFillerStats(sessionId: string, transcriptVerbatim: string, durationSeconds: number): Promise<void> {
  const stats = computeFillerStats(transcriptVerbatim, durationSeconds);
  await updateSessionFillerStats(sessionId, stats.count, stats.ratePerMinute);
  logger.info(`[pipeline] session ${sessionId}: filler stats = ${stats.count} words, ${stats.ratePerMinute}/min (${stats.label})`);
}

// Runs the full grading rubric on a session that was saved without it (e.g. a
// free recording, or any session where "Get AI feedback" was left off).
// Necessarily re-uploads the video — Gemini Files API entries expire after
// 48h (plan.md §10), so there's nothing from an earlier transcript-only call
// to reuse. Emits phase updates via processingEvents so a screen can show progress.
export async function gradeExistingSession(sessionId: string, context: GradingContext, videoUri: string): Promise<void> {
  const emit = (phase: ProcessingPhase, extra?: Partial<{ errorMessage: string }>) =>
    emitProcessingStatus({ sessionId, phase, ...extra });

  try {
    emit("uploading");
    const scores = await runGradingPass(sessionId, context, videoUri, emit);
    logger.info(`[pipeline] session ${sessionId}: graded on demand`);
    emit("done");

    celebrateCompletion(sessionId, scores.overallScore).catch((err) =>
      logger.error(`[pipeline] session ${sessionId}: celebration feedback failed — ${(err as Error).message}`),
    );
  } catch (error) {
    logger.error(`[pipeline] session ${sessionId}: on-demand grading failed — ${(error as Error).message}`);
    emit("error", { errorMessage: describeGeminiError(error) });
    throw error;
  }
}

// Runs the save -> transcribe(/grade) -> (optionally) Notion pipeline for a
// session, entirely independent of any mounted screen. Call this once
// (fire-and-forget) right after the user chooses "Save" on the Preview
// screen; screens observe progress via processingEvents instead of driving
// it, so navigating away never interrupts the work.
export async function processSession(args: ProcessSessionArgs): Promise<void> {
  const { sessionId, videoUri, durationSecondsLocal, wantsGrading, wantsNotionSync } = args;
  const gradingContext = subjectToGradingContext(args);
  const emit = (phase: ProcessingPhase, extra?: Partial<{ errorMessage: string }>) =>
    emitProcessingStatus({ sessionId, phase, ...extra });

  try {
    logger.info(
      `[pipeline] session ${sessionId}: starting (type=${subjectToSessionType(args)}, grading=${wantsGrading}, notion=${wantsNotionSync})`,
    );
    emit("saving_locally");
    const existing = await getSessionById(sessionId);
    if (!existing) {
      logger.info(`[pipeline] session ${sessionId}: inserting new row`);
      await insertSession({
        id: sessionId,
        promptId: subjectToPromptId(args),
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
        sessionType: subjectToSessionType(args),
        scriptId: args.kind === "script" ? args.script.id : null,
        cuesEnabled: args.kind === "script" ? args.cuesEnabled : null,
        fillerWordCount: null,
        fillerRatePerMinute: null,
        videoDeletedAt: null,
        deletedAt: null,
      });
    } else {
      logger.info(`[pipeline] session ${sessionId}: found existing row (status=${existing.status}), retrying`);
    }

    // For a retry, don't just check that a transcript exists — if grading was
    // requested, the scores row has to exist too. Otherwise a retry after a
    // failure that happened between saving the transcript and upserting
    // scores (e.g. the DB write for scores throwing) would see the transcript
    // already there, skip straight past scoring, and mark the session "done"
    // without ever having graded it. Same idea for the non-grading path: a
    // retry after a failure between saving the transcript and persisting
    // filler stats must not skip straight past persistFillerStats, or those
    // columns stay null forever.
    const alreadyHasRequiredArtifacts = wantsGrading
      ? !!existing?.transcriptClean && !!(await getScoresBySessionId(sessionId))
      : !!existing?.transcriptClean && existing?.fillerWordCount !== null;

    if (!alreadyHasRequiredArtifacts) {
      if (wantsGrading) {
        await runGradingPass(sessionId, gradingContext, videoUri, emit);
      } else {
        const transcript = await transcribeOnly(videoUri, (step) => emit(progressStepToPhase(step)));
        await updateSessionTranscripts(
          sessionId,
          transcript.transcript_verbatim,
          transcript.transcript_clean,
          transcript.duration_seconds,
        );
        await persistFillerStats(sessionId, transcript.transcript_verbatim, transcript.duration_seconds);
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
        showGlobalToast(`Saved locally — Notion sync failed (${describeNotionError(notionError)})`, "error");
      }
    }

    await updateSessionStatus(sessionId, "done");
    logger.info(`[pipeline] session ${sessionId}: done`);
    emit("done");

    // Today's practice just happened, so re-arm the reminder for tomorrow
    // instead of leaving a same-day nudge armed that would fire anyway.
    syncDailyReminder().catch((err) =>
      logger.error(`[pipeline] session ${sessionId}: reminder resync failed — ${(err as Error).message}`),
    );

    const scores = await getScoresBySessionId(sessionId);
    if (scores) {
      celebrateCompletion(sessionId, scores.overallScore).catch((err) =>
        logger.error(`[pipeline] session ${sessionId}: celebration feedback failed — ${(err as Error).message}`),
      );
    } else {
      showGlobalToast("Session ready", "success", () => goToResult(sessionId));
      notifySessionComplete(sessionId, "Session ready", "Your transcript is ready — tap to view.").catch((err) =>
        logger.error(`[pipeline] session ${sessionId}: completion notification failed — ${(err as Error).message}`),
      );
    }
  } catch (error) {
    logger.error(`[pipeline] session ${sessionId}: failed — ${(error as Error).message}`);
    await updateSessionStatus(sessionId, "error").catch(() => undefined);
    emit("error", { errorMessage: describeGeminiError(error) });
  }
}
