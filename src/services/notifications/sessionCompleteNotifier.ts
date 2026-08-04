import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { requestNotificationPermission } from "./reminderScheduler";
import { logger } from "../../utils/logger";

// The pipeline already surfaces completion via an in-app toast
// (showGlobalToast, see sessionProcessor.ts) whenever the app is
// foregrounded — this only adds a real OS notification for the case that
// toast can't cover: the app backgrounded but still alive (JS suspends
// within roughly iOS's default grace period once fully backgrounded, so
// this doesn't guarantee delivery for a long multi-minute background
// stretch — see plan notes — but does cover brief backgrounding).
export async function notifySessionComplete(sessionId: string, title: string, body: string): Promise<void> {
  if (AppState.currentState === "active") return;

  const granted = await requestNotificationPermission();
  if (!granted) return;

  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { sessionId } },
    trigger: null,
  }).catch((error) => logger.error(`[notifications] failed to notify session ${sessionId} complete: ${(error as Error).message}`));
}
