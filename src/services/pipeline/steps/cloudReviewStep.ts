import { getSessionById, updateTranscriptFields } from "../../db/sessionsRepo";
import { analysisToSessionScores, upsertScores } from "../../db/scoresRepo";
import { getArtifact, putArtifact } from "../../db/artifactsRepo";
import { whyNoDeepReview } from "../../cloud/routing";
import { applyCloudCoach } from "./coachStep";
import { recordCloudUsage } from "../../cloud/usageStore";
import { requestAnalysis } from "../../analysis";
import type { ProviderId } from "../../cloud/providers";
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
  // Which provider and model wrote the review.
  provider?: ProviderId;
  model?: string;
  // True when the judge transcribed the audio itself (a review from the
  // video). A judge that read the transcript returns the phone's.
  heardAudio?: boolean;
}

// The judged layer of a take: Tono AI's review (or, until session 08, the
// person's own key), through the AnalysisService. The step only gathers the
// take and stores what comes back: the scores row, the judge's copy of the
// transcript, token usage, the coach card from the same call, and the take's
// score sheets. Which judge, which model, whether it read the transcript or
// watched the video: all inside the providers (services/analysis/providers).
export async function cloudReviewStep(sessionId: string): Promise<void> {
  const session = await getSessionById(sessionId);
  if (!session) throw new StepError("Session not found.");
  const context = await gradingContextFromSession(session);
  if (!context) throw new StepError("Couldn't find this session's prompt or script.");
  const [pauses, presence] = await Promise.all([
    getArtifact<PauseAnalysis>(sessionId, "pauses"),
    getArtifact<PresenceMetrics>(sessionId, "presence"),
  ]);

  const hasVideo = !session.videoDeletedAt && videoExists(resolveVideoUri(session));
  // The step exists because this take was opted in (on the save screen, or
  // later from the take itself).
  const result = await requestAnalysis(
    "take_review",
    { session, context, pauses, presence, stutterMode: defaultsFromProfile(getUserProfile()).stutterMode },
    { takeId: sessionId, takeOptIn: true, hasVideo, hasTranscript: !!session.transcriptVerbatim?.trim() },
  );
  if (result.status !== "done") {
    if (result.status === "unavailable") {
      const message =
        result.message ??
        (result.reason === "no_input"
          ? "There's no transcript and no video to review."
          : await whyNoDeepReview());
      throw new StepError(message);
    }
    throw new StepError("The review is still under way.");
  }

  const { value: review, provenance } = result;
  const { analysis } = review;
  // Before the scores land, so the usage is there when the screen updates.
  await recordCloudUsage(sessionId, {
    provider: review.providerId,
    model: provenance.model ?? "unknown",
    input: provenance.input === "video" ? "video" : "measurements",
    elapsedMs: review.elapsedMs,
    videoBytes: review.videoBytes,
    usage: review.usage,
  });
  await upsertScores(analysisToSessionScores(sessionId, analysis));
  await putArtifact(sessionId, "cloud_transcript", {
    verbatim: analysis.transcript_verbatim,
    clean: analysis.transcript_clean,
    durationSeconds: analysis.duration_seconds,
    provider: review.providerId,
    model: provenance.model,
    heardAudio: review.heardAudio,
  } satisfies CloudTranscriptArtifact);
  await refreshSessionScore(sessionId);
  // Tono AI wrote the coach card in the same call: no second request.
  if (review.quickCoach != null) await applyCloudCoach(sessionId, review.quickCoach, provenance);

  // No device transcript at all (on-device transcription failed): the
  // judge's transcript, heard from the audio, becomes the session's.
  if (!session.transcriptVerbatim && review.heardAudio) {
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
