import { analyzeUploadedVideo, resolveUploadForGrading } from "../../gemini/transcribeSession";
import { getSessionById, updateSessionGeminiFile, updateTranscriptFields } from "../../db/sessionsRepo";
import { analysisToSessionScores, upsertScores } from "../../db/scoresRepo";
import { getArtifact, putArtifact } from "../../db/artifactsRepo";
import { currentProvider, hasConsent, modelFor, reviewBlockedReason, type ProviderId } from "../../cloud/providers";
import { measuredReview } from "../../cloud/measuredReview";
import type { TextProviderId } from "../../cloud/textProviders";
import type { PauseAnalysis } from "../../../domain/dsp/pauses";
import type { PresenceMetrics } from "../../../domain/presenceMetrics";
import { defaultsFromProfile } from "../../../domain/profile";
import { getUserProfile } from "../../prefs/prefsStore";
import { setStepStatus } from "../../db/stepsRepo";
import { resolveVideoUri, videoExists } from "../../storage/videoStorage";
import { gradingContextFromSession } from "../../sessions/sessionSubject";
import { emitStepEvent } from "../processingEvents";
import { refreshSessionScore } from "../../sessions/sessionScoreService";
import { StepError } from "../stepRunner";

export interface CloudTranscriptArtifact {
  verbatim: string;
  clean: string;
  durationSeconds: number;
  // Which provider and model wrote the review (absent on older takes, which
  // were all Gemini).
  provider?: ProviderId;
  model?: string;
}

// The "deep review": structure, delivery, presence and coaching scores from
// the bring-your-own-key provider chosen in Settings (services/cloud).
// Gemini watches the video; the others read the on-device transcript and
// measurements. Writes only scores plus its own copy of the transcript (as
// an artifact) — it never touches the on-device results.
export async function cloudReviewStep(sessionId: string): Promise<void> {
  const session = await getSessionById(sessionId);
  if (!session) throw new StepError("Session not found.");
  const provider = currentProvider();
  if (!hasConsent(provider.id)) {
    throw new StepError(`Deep reviews with ${provider.name} haven't been allowed yet — tap Get to review what's sent, or choose a provider in Settings.`);
  }

  const context = await gradingContextFromSession(session);
  if (!context) throw new StepError("Couldn't find this session's prompt or script.");

  if (provider.input === "measurements") {
    const blocked = reviewBlockedReason(provider, { hasVideo: true, hasDeviceTranscript: !!session.transcriptVerbatim });
    if (blocked) throw new StepError(`${blocked} Retry the transcript first, or switch to Gemini in Settings to review from the video.`);
    const [pauses, presence] = await Promise.all([
      getArtifact<PauseAnalysis>(sessionId, "pauses"),
      getArtifact<PresenceMetrics>(sessionId, "presence"),
    ]);
    const analysis = await measuredReview(
      { session, context, pauses, presence, stutterMode: defaultsFromProfile(getUserProfile()).stutterMode },
      provider.id as TextProviderId,
    );
    await upsertScores(analysisToSessionScores(sessionId, analysis));
    await refreshSessionScore(sessionId);
    await putArtifact(sessionId, "cloud_transcript", {
      verbatim: analysis.transcript_verbatim,
      clean: analysis.transcript_clean,
      durationSeconds: analysis.duration_seconds,
      provider: provider.id,
      model: modelFor(provider.id),
    } satisfies CloudTranscriptArtifact);
    return;
  }

  if (session.videoDeletedAt) throw new StepError("The video was deleted, so a deep review isn't possible.");
  const videoUri = resolveVideoUri(session);
  if (!videoExists(videoUri)) throw new StepError("The video file is missing, so a deep review isn't possible.");

  // Ground Gemini on the device transcript so its quotes line up with it.
  const hasDeviceTranscript = !!session.transcriptVerbatim && session.transcriptionSource !== "gemini";
  const grounded =
    context.kind === "prompt" && hasDeviceTranscript ? { ...context, groundingTranscript: session.transcriptVerbatim! } : context;

  const existingUpload =
    session.geminiFileName && session.geminiFileUri && session.geminiFileUploadedAt
      ? { name: session.geminiFileName, uri: session.geminiFileUri, uploadedAt: session.geminiFileUploadedAt }
      : null;
  const { uploaded, reused } = await resolveUploadForGrading(videoUri, existingUpload);
  if (!reused) {
    await updateSessionGeminiFile(sessionId, { name: uploaded.name, uri: uploaded.uri, uploadedAt: new Date().toISOString() });
  }

  const analysis = await analyzeUploadedVideo(uploaded, grounded);
  await upsertScores(analysisToSessionScores(sessionId, analysis));
  await refreshSessionScore(sessionId);
  await putArtifact(sessionId, "cloud_transcript", {
    verbatim: analysis.transcript_verbatim,
    clean: analysis.transcript_clean,
    durationSeconds: analysis.duration_seconds,
    provider: "gemini",
    model: modelFor("gemini"),
  } satisfies CloudTranscriptArtifact);

  // No device transcript at all (on-device transcription failed): the deep
  // review's transcript becomes the session's transcript.
  if (!session.transcriptVerbatim) {
    await updateTranscriptFields(sessionId, {
      verbatim: analysis.transcript_verbatim,
      clean: analysis.transcript_clean,
      durationSeconds: analysis.duration_seconds,
      source: "gemini",
      words: null,
    });
    await setStepStatus(sessionId, "transcribe", "done");
    emitStepEvent({ sessionId, step: "transcribe", status: "done" });
    // Fillers, pace and coaching can now use this transcript.
    for (const step of ["audio_metrics", "coach"] as const) {
      await setStepStatus(sessionId, step, "pending");
      emitStepEvent({ sessionId, step, status: "pending" });
    }
  }
}
