import * as Haptics from "expo-haptics";
import {
  analyzeUploadedVideo,
  cleanTranscriptOnly,
  resolveUploadForGrading,
  transcribeOnly,
  type GradingContext,
  type TranscribeProgressStep,
} from "../gemini/transcribeSession";
import { describeGeminiError } from "../gemini/describeError";
import { appendTodayTranscript } from "../notion/appendTodayTranscript";
import { describeNotionError } from "../notion/describeError";
import {
  getSessionById,
  insertSession,
  markSessionNotionSynced,
  updateSessionAudioAnalysis,
  updateSessionFillerStats,
  updateSessionGeminiFile,
  updateSessionStatus,
  updateSessionTranscripts,
  type AudioAnalysisUpdate,
} from "../db/sessionsRepo";
import { computeFillerStats, detectRepeatedWordsFromWords } from "../../domain/transcriptAnnotations";
import { decodeVideoAudio, analyzePitchVolume, type PitchVolumeAnalysis } from "../../domain/audioAnalysis";
import { transcribeOnDevice } from "../onDeviceAsr/onDeviceAsrClient";
import { transcribeWithAssemblyAi } from "../assemblyai/assemblyAiClient";
import { getAssemblyAiEnabled } from "../prefs/prefsStore";
import { computeWpmCurve } from "../../domain/wpmCurve";
import { getCompletedSessionDates } from "../db/statsRepo";
import { analysisToSessionScores, getScoresBySessionId, upsertScores } from "../db/scoresRepo";
import { getPrompt } from "../db/promptsRepo";
import { getScriptById } from "../db/scriptsRepo";
import { isFreeRecordPrompt } from "../../data/topics";
import { planTextToNullableFields, type PlanText } from "../../domain/planYourPoint";
import { emitProcessingStatus, type ProcessingPhase } from "./processingEvents";
import { showGlobalToast } from "../../components/common/ToastProvider";
import { notifySessionComplete } from "../notifications/sessionCompleteNotifier";
import { syncDailyReminder } from "../notifications/reminderScheduler";
import { navigationRef } from "../../navigation/navigationRef";
import { computeStreaks, streakMilestoneReached } from "../../domain/streaks";
import { logger } from "../../utils/logger";
import type { RecordingSubject, Session, SessionType, TranscriptWord, TranscriptionSource } from "../../domain/sessionTypes";

function subjectToGradingContext(subject: RecordingSubject): GradingContext {
  return subject.kind === "script"
    ? { kind: "script", script: subject.script, cuesEnabled: subject.cuesEnabled }
    : { kind: "prompt", promptText: subject.prompt.text, planText: subject.planText };
}

function subjectToPromptId(subject: RecordingSubject): string {
  return subject.kind === "script" ? subject.script.id : subject.prompt.id;
}

function subjectToSessionType(subject: RecordingSubject): SessionType {
  if (subject.kind === "script") return "script_practice";
  // Checked before free_record/spontaneous — Concise Mode is a distinct,
  // deliberately-chosen drill, not a duration variant of either.
  if (subject.conciseSeconds) return "concise";
  return isFreeRecordPrompt(subject.prompt.id) ? "free_record" : "spontaneous";
}

// Rebuilds a GradingContext for a previously-saved session (the "Grade with
// Gemini" retry path from Result screen) — unlike the initial pipeline run,
// there's no RecordingSubject from navigation params here, just the DB row.
// Deliberately does NOT re-resolve a groundingTranscript from the session's
// own stored transcriptWords — this path always re-transcribes via Gemini
// itself rather than grounding against the audio-first transcript, whether
// or not the video upload underneath it gets reused (see runGradingPass).
export async function sessionToGradingContext(session: Session): Promise<GradingContext | null> {
  if (session.sessionType === "script_practice") {
    const script = session.scriptId ? getScriptById(session.scriptId) : undefined;
    if (!script) return null;
    return { kind: "script", script, cuesEnabled: session.cuesEnabled ?? false };
  }
  const prompt = await getPrompt(session.promptId);
  if (!prompt) return null;
  const planText: PlanText | undefined =
    session.planPointText || session.planReasonText || session.planExampleText
      ? {
          point: session.planPointText ?? "",
          reason: session.planReasonText ?? "",
          example: session.planExampleText ?? "",
        }
      : undefined;
  return { kind: "prompt", promptText: prompt.text, planText };
}

// Rebuilds a full RecordingSubject for a previously-saved session (History's
// "reopen an in-progress/errored session" path, which needs to hand a
// ProcessSessionArgs-shaped subject to the Processing screen for retrying) —
// same idea as sessionToGradingContext above, but keeps the full Prompt/Script
// object rather than just the text Gemini needs.
export async function sessionToRecordingSubject(session: Session): Promise<RecordingSubject | null> {
  if (session.sessionType === "script_practice") {
    const script = session.scriptId ? getScriptById(session.scriptId) : undefined;
    if (!script) return null;
    return { kind: "script", script, cuesEnabled: session.cuesEnabled ?? false };
  }
  const prompt = await getPrompt(session.promptId);
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

// ---------------------------------------------------------------------------
// Audio-first pipeline (Phase 2): on-device ASR (default, free) + AssemblyAI
// (opt-in) + on-device pitch/volume DSP. All independent of wants_grading —
// see plan.md's Phase 2 for the full design/rationale.
// ---------------------------------------------------------------------------

interface ResolvedTranscriptSource {
  text: string;
  words: TranscriptWord[];
  engine: Extract<TranscriptionSource, "whisper_ondevice" | "assemblyai">;
  assemblyaiTranscriptId: string | null;
  durationSeconds: number;
}

// Decodes the video's audio track once (shared by ASR + DSP), then runs
// on-device ASR and (if opted in) AssemblyAI concurrently, plus DSP pitch/
// volume analysis. Never throws — every leg degrades to null/failed on its
// own so one failure never blocks the others or the overall session.
async function resolveTranscriptAndAudio(videoUri: string): Promise<{
  transcriptSource: ResolvedTranscriptSource | null;
  dsp: PitchVolumeAnalysis | null;
}> {
  const decoded = await decodeVideoAudio(videoUri);
  if (!decoded) {
    logger.warn("[pipeline] audio decode failed — on-device ASR and DSP both unavailable for this session");
  }

  const [onDeviceResult, assemblyAiResult] = await Promise.all([
    decoded
      ? transcribeOnDevice(decoded.waveform).catch((error) => {
          logger.error(`[pipeline] on-device ASR failed — ${(error as Error).message}`);
          return null;
        })
      : Promise.resolve(null),
    getAssemblyAiEnabled()
      ? transcribeWithAssemblyAi(videoUri).catch((error) => {
          logger.error(`[pipeline] AssemblyAI transcription failed — ${(error as Error).message}`);
          return null;
        })
      : Promise.resolve(null),
  ]);

  const dsp = decoded ? analyzePitchVolume(decoded.waveform, decoded.sampleRate) : null;

  // AssemblyAI takes priority when configured+succeeded (the reason to pay
  // for it is higher accuracy); on-device otherwise; null means both legs
  // failed/were unavailable, so the caller falls all the way back to Gemini
  // self-transcription.
  const transcriptSource: ResolvedTranscriptSource | null = assemblyAiResult
    ? {
        text: assemblyAiResult.text,
        words: assemblyAiResult.words,
        engine: "assemblyai",
        assemblyaiTranscriptId: assemblyAiResult.id,
        durationSeconds: assemblyAiResult.audioDurationSeconds,
      }
    : onDeviceResult
      ? {
          text: onDeviceResult.text,
          words: onDeviceResult.words.map((w) => ({
            text: w.text,
            startMs: Math.round(w.startSeconds * 1000),
            endMs: Math.round(w.endSeconds * 1000),
          })),
          engine: "whisper_ondevice",
          assemblyaiTranscriptId: null,
          durationSeconds: onDeviceResult.durationSeconds,
        }
      : null;

  return { transcriptSource, dsp };
}

// Persists everything the audio-first pipeline produced, independent of
// wants_grading — repeated-word count and the WPM curve both need
// word-level timestamps, so they're null whenever no transcript source
// resolved (full Gemini-fallback case), not zero/empty.
async function persistAudioAnalysis(
  sessionId: string,
  transcriptSource: ResolvedTranscriptSource | null,
  dsp: PitchVolumeAnalysis | null,
): Promise<void> {
  const update: AudioAnalysisUpdate = {
    transcriptWords: transcriptSource?.words ?? null,
    wpmCurve:
      transcriptSource && transcriptSource.words.length > 0
        ? computeWpmCurve(transcriptSource.words, transcriptSource.durationSeconds)
        : null,
    repeatedWordCount:
      transcriptSource && transcriptSource.words.length > 0
        ? detectRepeatedWordsFromWords(transcriptSource.words).length
        : null,
    assemblyaiTranscriptId: transcriptSource?.assemblyaiTranscriptId ?? null,
    dspStatus: dsp?.status ?? null,
    pitchContourHz: dsp?.pitchContourHz ?? null,
    volumeEnvelopeDbfs: dsp?.volumeEnvelopeDbfs ?? null,
    pitchAvgHz: dsp?.pitchAvgHz ?? null,
    pitchMinHz: dsp?.pitchMinHz ?? null,
    pitchMaxHz: dsp?.pitchMaxHz ?? null,
    volumeAvgDbfs: dsp?.volumeAvgDbfs ?? null,
    volumeStddevDbfs: dsp?.volumeStddevDbfs ?? null,
  };
  await updateSessionAudioAnalysis(sessionId, update);
  logger.info(
    `[pipeline] session ${sessionId}: audio analysis persisted ` +
      `(transcriptSource=${transcriptSource?.engine ?? "none"}, dsp=${dsp?.status ?? "not attempted"})`,
  );
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
  const prompt = await getPrompt(session.promptId);
  await appendTodayTranscript(session.transcriptClean, prompt?.text ?? "");
  await markSessionNotionSynced(sessionId);
  logger.info(`[pipeline] session ${sessionId}: Notion sync complete`);
}

// Deterministic, on-device — runs for every session right after a transcript
// exists, independent of whether Gemini's grading happened to notice
// fillers. Prefers the audio-first transcript source's text (more reliably
// preserves filler tokens than Gemini's own self-transcription) when one
// resolved; the caller passes whichever text actually ended up being the
// authoritative one for this session.
async function persistFillerStats(sessionId: string, transcriptText: string, durationSeconds: number): Promise<void> {
  const stats = computeFillerStats(transcriptText, durationSeconds);
  await updateSessionFillerStats(sessionId, stats.count, stats.ratePerMinute);
  logger.info(`[pipeline] session ${sessionId}: filler stats = ${stats.count} words, ${stats.ratePerMinute}/min (${stats.label})`);
}

// Runs the full grading rubric (upload -> transcribe -> score) and saves the
// result. Shared by the on-demand "Grade with Gemini" retry path
// (gradeExistingSession) and the initial pipeline run below so the two don't
// drift out of sync. The retry path doesn't get the parallel-upload
// optimization (audioAnalysis defaults to "not attempted") since there's
// nothing to parallelize against on the audio side — but it CAN skip the
// upload itself: if a still-fresh, still-ACTIVE upload from a previous
// attempt is on record (analysis failed after a successful upload),
// resolveUploadForGrading reuses it instead of re-uploading the video.
async function runGradingPass(
  sessionId: string,
  context: GradingContext,
  videoUri: string,
  emit: (phase: ProcessingPhase, extra?: Partial<{ errorMessage: string }>) => void,
  audioAnalysis: { transcriptSource: ResolvedTranscriptSource | null; dsp: PitchVolumeAnalysis | null } = {
    transcriptSource: null,
    dsp: null,
  },
): Promise<ReturnType<typeof analysisToSessionScores>> {
  emit("uploading");
  const existing = await getSessionById(sessionId);
  const existingUpload =
    existing?.geminiFileName && existing.geminiFileUri && existing.geminiFileUploadedAt
      ? { name: existing.geminiFileName, uri: existing.geminiFileUri, uploadedAt: existing.geminiFileUploadedAt }
      : null;
  const { uploaded, reused } = await resolveUploadForGrading(videoUri, existingUpload, (step) =>
    emit(progressStepToPhase(step)),
  );
  if (!reused) {
    await updateSessionGeminiFile(sessionId, { name: uploaded.name, uri: uploaded.uri, uploadedAt: new Date().toISOString() });
  }

  const groundedContext: GradingContext =
    context.kind === "prompt" && audioAnalysis.transcriptSource
      ? { ...context, groundingTranscript: audioAnalysis.transcriptSource.text }
      : context;

  const analysis = await analyzeUploadedVideo(uploaded, groundedContext, (step) => emit(progressStepToPhase(step)));

  // Gemini still produces the authoritative transcript_verbatim/transcript_clean
  // (now grounded, so it should closely match the audio-first source) — this
  // keeps Gemini's own evidence-quote annotations guaranteed-locatable within
  // whatever it returns. The audio-first source's word-level data is stored
  // separately (transcript_words_json etc.) and used for WPM/repeated-words.
  await updateSessionTranscripts(
    sessionId,
    analysis.transcript_verbatim,
    analysis.transcript_clean,
    analysis.duration_seconds,
    "gemini",
  );
  // Filler detection prefers the audio-first transcript's text when
  // available — it more reliably preserves filler tokens than Gemini's own
  // self-transcription (see plan.md's Phase 2).
  await persistFillerStats(
    sessionId,
    audioAnalysis.transcriptSource?.text ?? analysis.transcript_verbatim,
    analysis.duration_seconds,
  );
  await persistAudioAnalysis(sessionId, audioAnalysis.transcriptSource, audioAnalysis.dsp);

  const scores = analysisToSessionScores(sessionId, analysis);
  await upsertScores(scores);
  logger.info(`[pipeline] session ${sessionId}: transcripts + scores saved locally`);
  return scores;
}

// Runs the full grading rubric on a session that was saved without it (e.g. a
// free recording, or any session where "Get AI feedback" was left off), or
// retries one whose grading previously failed. Re-uploads the video unless a
// still-fresh, still-ACTIVE upload from an earlier attempt is on record (see
// runGradingPass/resolveUploadForGrading) — Gemini Files API entries expire
// after 48h (plan.md §10), so anything older always gets a fresh upload.
// Emits phase updates via processingEvents so a screen can show progress.
export async function gradeExistingSession(sessionId: string, context: GradingContext, videoUri: string): Promise<void> {
  const emit = (phase: ProcessingPhase, extra?: Partial<{ errorMessage: string }>) =>
    emitProcessingStatus({ sessionId, phase, ...extra });

  try {
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
      const planFields = planTextToNullableFields(args.kind === "prompt" ? args.planText : undefined);
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
        planPointText: planFields.point,
        planReasonText: planFields.reason,
        planExampleText: planFields.example,
        transcriptWords: null,
        wpmCurve: null,
        repeatedWordCount: null,
        assemblyaiTranscriptId: null,
        dspStatus: null,
        pitchContourHz: null,
        volumeEnvelopeDbfs: null,
        pitchAvgHz: null,
        pitchMinHz: null,
        pitchMaxHz: null,
        volumeAvgDbfs: null,
        volumeStddevDbfs: null,
        geminiFileName: null,
        geminiFileUri: null,
        geminiFileUploadedAt: null,
      });
    } else {
      logger.info(`[pipeline] session ${sessionId}: found existing row (status=${existing.status}), retrying`);
      // A retry's status otherwise stays stuck on "error" (or whatever it
      // was) in the DB for the entire retry attempt — nothing set it back to
      // "processing" here before. Harmless if the attempt is genuinely fast,
      // but misleading in History if it's slow or hangs: the row would keep
      // reading "Failed" while a retry was actually in flight.
      await updateSessionStatus(sessionId, "processing");
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
        // On-device ASR/AssemblyAI/DSP all start concurrently with Gemini's
        // video upload (inside runGradingPass) — none of them block it.
        const audioAnalysisPromise = resolveTranscriptAndAudio(videoUri);
        const audioAnalysis = await audioAnalysisPromise;
        await runGradingPass(sessionId, gradingContext, videoUri, emit, audioAnalysis);
      } else {
        const audioAnalysis = await resolveTranscriptAndAudio(videoUri);
        if (audioAnalysis.transcriptSource) {
          // Free path — video never reaches Gemini. Only a lightweight
          // text-only call for transcript_clean.
          emit("transcribing");
          const transcriptClean = await cleanTranscriptOnly(audioAnalysis.transcriptSource.text);
          await updateSessionTranscripts(
            sessionId,
            audioAnalysis.transcriptSource.text,
            transcriptClean,
            audioAnalysis.transcriptSource.durationSeconds,
            audioAnalysis.transcriptSource.engine,
          );
          await persistFillerStats(
            sessionId,
            audioAnalysis.transcriptSource.text,
            audioAnalysis.transcriptSource.durationSeconds,
          );
          await persistAudioAnalysis(sessionId, audioAnalysis.transcriptSource, audioAnalysis.dsp);
          logger.info(`[pipeline] session ${sessionId}: transcript-only saved locally (audio-first, no video upload)`);
        } else {
          // Full fallback — neither on-device ASR nor AssemblyAI produced a
          // transcript, so Gemini self-transcribes from the video as before.
          const transcript = await transcribeOnly(videoUri, (step) => emit(progressStepToPhase(step)));
          await updateSessionTranscripts(
            sessionId,
            transcript.transcript_verbatim,
            transcript.transcript_clean,
            transcript.duration_seconds,
            "gemini",
          );
          await persistFillerStats(sessionId, transcript.transcript_verbatim, transcript.duration_seconds);
          await persistAudioAnalysis(sessionId, null, audioAnalysis.dsp);
          logger.info(`[pipeline] session ${sessionId}: transcript-only saved locally (Gemini fallback)`);
        }
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
