import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { logger } from "../../utils/logger";
import { endPrepActivity, startPrepActivity } from "./prepActivity";

// While you research in another app, the phone tells you when your time is
// up: a notification at the deadline, and on Android an ongoing one while it
// runs ("Researching · back by 8:42 PM"). Android notifications can't show a
// live countdown from here, so it shows the end time. On iPhone the Dynamic
// Island will carry the live timer (a later phase); until then the deadline
// alert is what there is.
//
// Only if notifications are already allowed: a mid-flow permission prompt
// would interrupt the thing you're doing.

const DONE_ID = "prep-time-up";
const RUNNING_ID = "prep-running";

async function allowed(): Promise<boolean> {
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

function clock(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// Arms the alert for `deadlineMs`; calling it again re-arms (an extension).
// On iPhone the live timer goes to the Dynamic Island too, which needs no
// notification permission.
export async function armPrepAlert(deadlineMs: number, promptText: string): Promise<void> {
  startPrepActivity(promptText, Date.now(), deadlineMs).catch(() => undefined);
  try {
    if (!(await allowed())) return;
    await clearPrepAlert();
    const deadline = new Date(deadlineMs);
    if (deadline.getTime() <= Date.now() + 1000) return;
    await Notifications.scheduleNotificationAsync({
      identifier: DONE_ID,
      content: { title: "Prep time's up", body: `Your prompt is waiting: ${promptText}`, sound: false },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: deadline },
    });
    if (Platform.OS === "android") {
      const minutes = Math.max(1, Math.round((deadlineMs - Date.now()) / 60_000));
      await Notifications.scheduleNotificationAsync({
        identifier: RUNNING_ID,
        content: {
          title: `Researching · back by ${clock(deadline)}`,
          body: `${minutes} ${minutes === 1 ? "minute" : "minutes"} to go. ${promptText}`,
          sticky: true,
          autoDismiss: false,
          sound: false,
        },
        trigger: null,
      });
    }
  } catch (error) {
    logger.warn(`[prep] couldn't arm the alert — ${(error as Error).message}`);
  }
}

export async function clearPrepAlert(): Promise<void> {
  endPrepActivity().catch(() => undefined);
  try {
    await Notifications.cancelScheduledNotificationAsync(DONE_ID).catch(() => undefined);
    await Notifications.dismissNotificationAsync(RUNNING_ID).catch(() => undefined);
    await Notifications.cancelScheduledNotificationAsync(RUNNING_ID).catch(() => undefined);
  } catch {
    // Nothing to clear.
  }
}
