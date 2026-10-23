import { File } from "expo-file-system";
import { uploadVideoForGrading } from "../gemini/transcribeSession";
import { getSessionById, isSessionLive, updateSessionGeminiFile } from "../db/sessionsRepo";
import { tonoDeleteFile } from "../tono/tonoApi";
import { providerFor } from "../cloud/routing";
import { MAX_REVIEW_VIDEO_BYTES, reviewsLeft } from "../cloud/inputGuards";
import { getCloudCallsToday } from "../prefs/prefsStore";
import { resolveVideoUri, videoExists } from "../storage/videoStorage";
import { todayISODate } from "../../utils/dateUtils";
import { logger } from "../../utils/logger";

// The video upload is the slowest part of a Gemini deep review, and it used
// to wait until every on-device step (transcript, voice, face, coaching) had
// finished. When a take is saved with a deep review wanted, the upload now
// starts straight away and runs alongside them; the review step picks up the
// uploaded file, or waits for an upload still under way. The upload itself
// is free: only the review call is billed and counted.

const inFlight = new Map<string, Promise<void>>();

export function startEarlyUpload(sessionId: string): void {
  if (inFlight.has(sessionId)) return;

  const task = (async () => {
    // Only a video-watching route is worth an early upload, and only when the
    // review would not be refused anyway (the person's own key has a daily cap;
    // Tono AI's server says no by itself).
    const resolved = await providerFor("video_review", { hasVideo: true, cloudReviewOn: true });
    if (!resolved || resolved.provider.input !== "video") return;
    if (resolved.transport === "direct" && reviewsLeft(getCloudCallsToday(todayISODate())) === 0) return;
    const session = await getSessionById(sessionId);
    if (!session || session.geminiFileName || session.videoDeletedAt) return;
    const videoUri = resolveVideoUri(session);
    if (!videoExists(videoUri) || (new File(videoUri).size ?? 0) > MAX_REVIEW_VIDEO_BYTES) return;
    const started = Date.now();
    const uploaded = await uploadVideoForGrading(videoUri, undefined, resolved.transport === "hosted" ? "hosted" : "direct");
    // Deleted while it uploaded: don't leave the video at Google.
    if (!(await isSessionLive(sessionId))) {
      await tonoDeleteFile(uploaded.name).catch(() => undefined);
      return;
    }
    await updateSessionGeminiFile(sessionId, { name: uploaded.name, uri: uploaded.uri, uploadedAt: new Date().toISOString() });
    logger.info(`[gemini] early upload for ${sessionId} ready in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  })()
    .catch((error) => logger.warn(`[gemini] early upload failed, the review step will upload instead: ${(error as Error).message}`))
    .finally(() => inFlight.delete(sessionId));
  inFlight.set(sessionId, task);
}

// Resolves once an early upload for this take (if any) has finished or
// failed. Never rejects.
export function earlyUploadSettled(sessionId: string): Promise<void> {
  return inFlight.get(sessionId) ?? Promise.resolve();
}
