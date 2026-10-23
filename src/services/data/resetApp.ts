import * as Notifications from "expo-notifications";
import { getDatabase, wipeDatabase } from "../db/database";
import { tonoDeleteFile } from "../tono/tonoApi";
import { deleteAllRecordings, deleteTempMedia } from "../storage/videoStorage";
import { deleteAllRewindAudio } from "../rewind/rewindStorage";
import { clearAllPrefs } from "../prefs/prefsStore";
import { clearLogs } from "../logs/logStore";
import { clearDevStore } from "../dev/devStore";
import { clearDecodedAudio } from "../pipeline/steps/decodedAudioCache";
import { logger } from "../../utils/logger";

// Puts the app back to a fresh install: every session, video, score, drill
// level, lesson, plan, skill check and feeling rep (every table is dropped
// and the migrations rebuild the database), every preference including the
// onboarding profile, the logs, the Dev tab's data and any reminders. API keys
// (Keychain/Keystore) and the downloaded on-device models are kept. Callers
// then send the user to onboarding.
// Videos uploaded for a deep review that Google still holds (a review that
// failed keeps its upload for a retry). Best effort: Google drops any file
// after 48 hours anyway.
async function deleteUploadedCopies(): Promise<void> {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ name: string }>(`SELECT gemini_file_name AS name FROM sessions WHERE gemini_file_name IS NOT NULL`);
    await Promise.all(rows.map((r) => tonoDeleteFile(r.name).catch(() => undefined)));
  } catch {
    // Offline, signed out or no database: nothing more to do.
  }
}

export async function resetApp(): Promise<void> {
  logger.info("[reset] resetting the app");
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
  await Notifications.dismissAllNotificationsAsync().catch(() => undefined);
  clearDecodedAudio();
  await deleteUploadedCopies();
  await wipeDatabase();
  deleteAllRecordings();
  deleteAllRewindAudio();
  const temp = deleteTempMedia();
  clearAllPrefs();
  clearLogs();
  clearDevStore();
  logger.info(`[reset] done — database, videos and settings cleared, ${temp} temp file(s) removed`);
}
