import { getSessionById, updateTranscriptFields } from "../../db/sessionsRepo";
import { judgedReviewToScores, upsertScores } from "../../db/scoresRepo";
import { getArtifact, putArtifact } from "../../db/artifactsRepo";
import { whyNotJudged } from "../../cloud/routing";
import { applyCloudCoach } from "./coachStep";
import { recordCloudUsage } from "../../cloud/usageStore";
import { requestAnalysis } from "../../analysis";
import type { PauseAnalysis } from "../../../domain/dsp/pauses";
import type { PresenceMetrics } from "../../../domain/presenceMetrics";
import { defaultsFromProfile } from "../../../domain/profile";
import { getUserProfile } from "../../prefs/prefsStore";
import { setStepStatus } from "../../db/stepsRepo";
import { resolveVideoUri, videoExists } from "../../storage/videoStorage";
import { gradingContextFromSession } from "../../sessions/sessionSubject";
import { emitStepEvent } from "../processingEvents";
import { measuredVoice, refreshSessionScore } from "../../sessions/sessionScoreService";
import { StepError } from "../stepRunner";

export interface CloudTranscriptArtifact {
  verbatim: string;
  clean: string;
  durationSeconds: number;
  model?: string;
  // True when the judge wrote the transcript from the audio (a video take
  // with no phone transcript). Otherwise `verbatim` is the phone's.
  heardAudio?: boolean;
}

// The judged layer of a take: Tono AI's judgement, through the
// AnalysisService. The step only gathers the take and stores what comes
// back: the judgement (the `judged_review` artifact, in the taxonomy's
// terms), its copy for the Scores tab, the clean transcript, token usage, the
// coach card from the same call, and the take's score sheets. Which model,
// whether it read the transcript or watched the video: all inside the
// provider (services/analysis/providers/tonoAi.ts).
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
      throw new StepError(result.message ?? whyNotJudged(result.reason));
    }
    throw new StepError("The review is still under way.");
  }

  const { value: out, provenance } = result;
  const { review } = out;
  const transcript = review.transcriptVerbatim ?? session.transcriptVerbatim ?? "";
  // Before the scores land, so the usage is there when the screen updates.
  await recordCloudUsage(sessionId, {
    provider: "tono",
    model: provenance.model ?? "unknown",
    input: provenance.input === "video" ? "video" : "measurements",
    elapsedMs: out.elapsedMs,
    videoBytes: out.videoBytes,
    usage: out.usage,
  });
  await putArtifact(sessionId, "judged_review", review);
  await upsertScores(judgedReviewToScores(sessionId, review, { wpm: measuredVoice(session).wpmAvg }));
  await putArtifact(sessionId, "cloud_transcript", {
    verbatim: transcript,
    clean: review.transcriptClean,
    durationSeconds: session.durationSeconds,
    model: provenance.model,
    heardAudio: out.heardAudio,
  } satisfies CloudTranscriptArtifact);
  await refreshSessionScore(sessionId);
  // Tono AI wrote the coach card in the same call: no second request.
  if (review.quickCoach != null) await applyCloudCoach(sessionId, review.quickCoach, provenance);

  // No device transcript at all (on-device transcription failed): the
  // judge's transcript, heard from the audio, becomes the session's.
  if (!session.transcriptVerbatim && review.transcriptVerbatim) {
    await updateTranscriptFields(sessionId, {
      verbatim: review.transcriptVerbatim,
      clean: review.transcriptClean,
      durationSeconds: session.durationSeconds,
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
