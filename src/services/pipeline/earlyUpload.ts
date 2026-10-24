import { File } from "expo-file-system";
import { uploadVideoForGrading } from "../tono/upload";
import { getSessionById, isSessionLive, updateSessionGeminiFile } from "../db/sessionsRepo";
import { tonoDeleteFile } from "../tono/tonoApi";
import { analysisContext } from "../cloud/routing";
import { routeAnalysis } from "../../domain/analysis/routing";
import { MAX_REVIEW_VIDEO_BYTES } from "../cloud/inputGuards";
import { resolveVideoUri, videoExists } from "../storage/videoStorage";
import { logger } from "../../utils/logger";

// The video upload is the slowest part of a take judged from its video, and it used
// to wait until every on-device step (transcript, voice, face, coaching) had
// finished. When a take is saved with a deep review wanted, the upload now
// starts straight away and runs alongside them; the review step picks up the
// uploaded file, or waits for an upload still under way. The upload itself
// is free: only the review call is billed and counted.

const inFlight = new Map<string, Promise<void>>();

export function startEarlyUpload(sessionId: string): void {
  if (inFlight.has(sessionId)) return;

  const task = (async () => {
    // Only a judgement that will watch the video is worth an early upload:
    // Tono AI judges from the transcript by default, so this is the Dev
    // "video" setting. The transcript doesn't exist yet at save time, so a
    // text judgement is assumed to find one. The server refuses the upload
    // by itself for someone with nothing left.
    const ctx = await analysisContext({ hasVideo: true, hasTranscript: true, takeOptIn: true });
    const route = routeAnalysis("take_review", ctx);
    if (route.producers[0] !== "tono_ai" || route.tonoInput !== "video") return;
    const session = await getSessionById(sessionId);
    if (!session || session.geminiFileName || session.videoDeletedAt) return;
    const videoUri = resolveVideoUri(session);
    if (!videoExists(videoUri) || (new File(videoUri).size ?? 0) > MAX_REVIEW_VIDEO_BYTES) return;
    const started = Date.now();
    const uploaded = await uploadVideoForGrading(videoUri);
    // Deleted while it uploaded: don't leave the video at Google.
    if (!(await isSessionLive(sessionId))) {
      await tonoDeleteFile(uploaded.name).catch(() => undefined);
      return;
    }
    await updateSessionGeminiFile(sessionId, { name: uploaded.name, uri: uploaded.uri, uploadedAt: new Date().toISOString() });
    logger.info(`[upload] early upload for ${sessionId} ready in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  })()
    .catch((error) => logger.warn(`[upload] early upload failed, the judging step will upload instead: ${(error as Error).message}`))
    .finally(() => inFlight.delete(sessionId));
  inFlight.set(sessionId, task);
}

// Resolves once an early upload for this take (if any) has finished or
// failed. Never rejects.
export function earlyUploadSettled(sessionId: string): Promise<void> {
  return inFlight.get(sessionId) ?? Promise.resolve();
}
