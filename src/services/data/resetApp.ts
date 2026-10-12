import * as Notifications from "expo-notifications";
import { wipeDatabase } from "../db/database";
import { deleteAllRecordings, deleteTempMedia } from "../storage/videoStorage";
import { clearAllPrefs } from "../prefs/prefsStore";
import { clearLogs } from "../logs/logStore";
import { clearDecodedAudio } from "../pipeline/steps/decodedAudioCache";
import { logger } from "../../utils/logger";

// Puts the app back to a fresh install: every session, video, score, drill
// level, lesson, plan, skill check and feeling rep (every table is dropped
// and the migrations rebuild the database), every preference including the
// onboarding profile, the logs and any reminders. API keys
// (Keychain/Keystore) and the downloaded on-device models are kept. Callers
// then send the user to onboarding.
export async function resetApp(): Promise<void> {
  logger.info("[reset] resetting the app");
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
  await Notifications.dismissAllNotificationsAsync().catch(() => undefined);
  clearDecodedAudio();
  await wipeDatabase();
  deleteAllRecordings();
  const temp = deleteTempMedia();
  clearAllPrefs();
  clearLogs();
  logger.info(`[reset] done — database, videos and settings cleared, ${temp} temp file(s) removed`);
}
