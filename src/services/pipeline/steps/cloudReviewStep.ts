import { analyzeUploadedVideo, resolveUploadForGrading } from "../../gemini/transcribeSession";
import { getSessionById, updateSessionGeminiFile, updateTranscriptFields } from "../../db/sessionsRepo";
import { analysisToSessionScores, upsertScores } from "../../db/scoresRepo";
import { putArtifact } from "../../db/artifactsRepo";
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
}

// Gemini "deep review": structure, delivery, presence and coaching scores.
// Writes only scores plus its own copy of the transcript (as an artifact).
// It never touches the on-device results — the old version re-saved every
// audio column with nulls, wiping the pace curve and pitch/volume charts
// whenever grading was requested after the fact.
export async function cloudReviewStep(sessionId: string): Promise<void> {
  const session = await getSessionById(sessionId);
  if (!session) throw new StepError("Session not found.");
  if (session.videoDeletedAt) throw new StepError("The video was deleted, so a deep review isn't possible.");
  const videoUri = resolveVideoUri(session);
  if (!videoExists(videoUri)) throw new StepError("The video file is missing, so a deep review isn't possible.");

  const context = await gradingContextFromSession(session);
  if (!context) throw new StepError("Couldn't find this session's prompt or script.");

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
      assemblyaiTranscriptId: null,
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
