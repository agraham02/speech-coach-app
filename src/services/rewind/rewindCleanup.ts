import { getAudioRetentionDays } from "../prefs/prefsStore";
import { listRewindAudioBefore, updateRewind } from "../db/rewindRepo";
import { deleteRewindAudio } from "./rewindStorage";
import { logger } from "../../utils/logger";

// Rewind recordings are voice memos of your day, so they don't pile up
// forever: after the time you choose (90 days unless you change it), the audio
// is deleted. What you said (the transcript), the counts and the notes stay.

export async function deleteOldRewindAudio(days: number): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const old = await listRewindAudioBefore(cutoff);
  for (const take of old) {
    deleteRewindAudio(take.audioFile);
    await updateRewind(take.id, { audioFile: null });
  }
  return old.length;
}

// Run on launch. 0 means keep forever.
export async function autoCleanupRewindAudio(): Promise<void> {
  const days = getAudioRetentionDays();
  if (!days) return;
  const removed = await deleteOldRewindAudio(days);
  if (removed) logger.info(`[rewind] removed audio for ${removed} take(s) older than ${days} days`);
}
