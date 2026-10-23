import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { logger } from "../../utils/logger";
import { prepRunningText, prepTimeUpText } from "../../domain/notificationCopy";
import { endPrepActivity } from "./prepActivity";

// The "away" alert for research in another app: a notification at the
// deadline, and on Android an ongoing one while it runs ("Researching · back
// by 8:42 PM"; Android notifications can't show a live countdown from here,
// so it shows the end time). On iPhone the live countdown is the Dynamic
// Island (prepActivity.ts), which is separate and needs no permission.
//
// It's only for while you're away. The screen arms it as you leave (the
// search button, or the app going to the background) and quiets it as you
// come back, so a notification never turns up while the clock is in front of
// you, and one that fired while you were gone doesn't linger.
//
// Only if notifications are already allowed: a mid-flow permission prompt
// would interrupt the thing you're doing.

const DONE_ID = "prep-time-up";
const RUNNING_ID = "prep-running";

// Arming and quieting run one after another, in the order asked: leaving and
// coming straight back must end quiet, never with an alert armed after it.
let queue: Promise<void> = Promise.resolve();
function inOrder(task: () => Promise<void>): Promise<void> {
  queue = queue.then(task, task);
  return queue;
}

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

// Arms the away alert for `deadlineMs`; calling it again re-arms. It never
// touches the Dynamic Island timer (an earlier version cleared that too and
// so ended the timer the moment it started).
export function armAwayAlert(deadlineMs: number, promptText: string): Promise<void> {
  return inOrder(() => arm(deadlineMs, promptText));
}

async function arm(deadlineMs: number, promptText: string): Promise<void> {
  try {
    if (!(await allowed())) return;
    await quiet();
    const deadline = new Date(deadlineMs);
    if (deadline.getTime() <= Date.now() + 1000) return;
    await Notifications.scheduleNotificationAsync({
      identifier: DONE_ID,
      content: { ...prepTimeUpText(promptText), sound: false },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: deadline },
    });
    if (Platform.OS === "android") {
      // It can't count down, so it gives the end time and never goes stale.
      await Notifications.scheduleNotificationAsync({
        identifier: RUNNING_ID,
        content: {
          ...prepRunningText(clock(deadline), promptText),
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

// You're back: the pending alert is cancelled and one that already fired is
// taken out of Notification Center. The Dynamic Island timer is left alone.
export function quietAwayAlert(): Promise<void> {
  return inOrder(quiet);
}

async function quiet(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(DONE_ID).catch(() => undefined);
  await Notifications.dismissNotificationAsync(DONE_ID).catch(() => undefined);
  await Notifications.cancelScheduledNotificationAsync(RUNNING_ID).catch(() => undefined);
  await Notifications.dismissNotificationAsync(RUNNING_ID).catch(() => undefined);
}

// The countdown is over (recording started, "No prep", time's up on screen,
// the screen closed, or a fresh launch after the app was killed): the timer
// ends and nothing is left armed.
export async function clearPrepAlert(): Promise<void> {
  endPrepActivity().catch(() => undefined);
  await quietAwayAlert();
}
