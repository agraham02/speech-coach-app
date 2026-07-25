import * as Notifications from "expo-notifications";
import { logger } from "../../utils/logger";

const REMINDER_IDENTIFIER = "daily-practice-reminder";

const REMINDER_MESSAGES = [
  "Time for today's practice — pick a prompt and go.",
  "One response, 1-5 minutes. Today's rep is waiting.",
  "Keep the streak alive — today's practice is ready when you are.",
];

export async function requestNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;

  if (!current.canAskAgain) {
    logger.warn("[reminders] notification permission previously denied, can't re-prompt");
    return false;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function scheduleDailyReminder(hour: number): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_IDENTIFIER).catch(() => undefined);

  const body = REMINDER_MESSAGES[Math.floor(Math.random() * REMINDER_MESSAGES.length)];
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_IDENTIFIER,
    content: {
      title: "Speech Coach",
      body,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute: 0,
    },
  });
  logger.info(`[reminders] scheduled daily reminder at ${hour}:00`);
}

export async function cancelDailyReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_IDENTIFIER).catch(() => undefined);
  logger.info("[reminders] cancelled daily reminder");
}
