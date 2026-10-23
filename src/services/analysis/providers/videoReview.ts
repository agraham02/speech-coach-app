import { File } from "expo-file-system";
import { analyzeUploadedVideo, resolveUploadForGrading } from "../../gemini/transcribeSession";
import type { GeminiTransport } from "../../gemini/geminiClient";
import { getSessionById, updateSessionGeminiFile } from "../../db/sessionsRepo";
import { MAX_REVIEW_VIDEO_BYTES } from "../../cloud/inputGuards";
import { measurementLines } from "../../cloud/measuredReview";
import { resolveVideoUri, videoExists } from "../../storage/videoStorage";
import { earlyUploadSettled } from "../../pipeline/earlyUpload";
import type { TokenUsage } from "../../../domain/cloudUsage";
import type { TakeReviewInput, TakeReviewOutput } from "../kinds";

// A take review from the video (Gemini watches and hears it), through Tono's
// server or with the person's own Gemini key. Shared by both providers: the
// upload, its reuse on a retry, and the call.

export class NoVideoError extends Error {}

export async function reviewFromVideo(input: TakeReviewInput, transport: GeminiTransport): Promise<Omit<TakeReviewOutput, "providerId"> & { model?: string }> {
  const { session } = input;
  if (session.videoDeletedAt) throw new NoVideoError("The video was deleted, so a review from the video isn't possible.");
  const videoUri = resolveVideoUri(session);
  if (!videoExists(videoUri)) throw new NoVideoError("The video file is missing, so a review from the video isn't possible.");
  const videoBytes = new File(videoUri).size ?? null;
  if ((videoBytes ?? 0) > MAX_REVIEW_VIDEO_BYTES) throw new NoVideoError("This video is too large to send for a review.");

  // An upload started when the take was saved (earlyUpload.ts): wait for it
  // rather than start a second one, then use the file it stored.
  await earlyUploadSettled(session.id);
  const latest = (await getSessionById(session.id)) ?? session;
  const existing =
    latest.geminiFileName && latest.geminiFileUri && latest.geminiFileUploadedAt
      ? { name: latest.geminiFileName, uri: latest.geminiFileUri, uploadedAt: latest.geminiFileUploadedAt }
      : null;
  const hosted = transport === "hosted";
  // Tono AI is told what the phone measured, as evidence for its scores: not
  // the transcript or the filler count, which it takes from its own listening.
  const measurements = hosted
    ? measurementLines({ session: latest, pauses: input.pauses, presence: input.presence, stutterMode: input.stutterMode, withFillers: false })
    : undefined;
  const { uploaded, reused } = await resolveUploadForGrading(videoUri, existing, undefined, transport);
  if (!reused) await updateSessionGeminiFile(session.id, { name: uploaded.name, uri: uploaded.uri, uploadedAt: new Date().toISOString() });

  const started = Date.now();
  const seen: { usage?: TokenUsage; model?: string } = {};
  const analysis = await analyzeUploadedVideo(
    uploaded,
    input.context,
    undefined,
    (usage) => {
      seen.usage = usage;
    },
    hosted
      ? {
          transport,
          videoSeconds: Math.min(300, Math.max(1, Math.ceil(session.durationSeconds || 60))),
          measurements,
          onHosted: (result) => {
            seen.model = result.model;
          },
        }
      : undefined,
  );
  return {
    analysis,
    quickCoach: hosted ? (analysis.quick_coach ?? null) : null,
    heardAudio: true,
    usage: seen.usage ?? null,
    elapsedMs: Date.now() - started,
    videoBytes,
    ...(seen.model ? { model: seen.model } : {}),
  };
}
