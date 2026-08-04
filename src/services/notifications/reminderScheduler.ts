import * as Notifications from "expo-notifications";
import { computeNextReminderDate } from "../../domain/reminderSettings";
import { getReminderSettings } from "../prefs/prefsStore";
import { getTodaysSession } from "../db/sessionsRepo";
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

// Re-arms the daily reminder as a single one-shot notification for the next
// moment you haven't practiced yet: later today if the reminder hour hasn't
// passed and today's session isn't done, otherwise tomorrow at the same hour.
// A one-shot (rather than a recurring DAILY trigger, which fires
// unconditionally every day regardless of app state) is what lets a day
// you've already practiced skip the nudge entirely — since it only fires
// once, call this again any time the underlying state could have changed
// (settings changed, a session just completed, the app relaunched) to keep
// it armed; see SettingsScreen, sessionProcessor, and AppNavigator.
export async function syncDailyReminder(): Promise<void> {
  const settings = getReminderSettings();
  if (!settings.enabled) {
    await cancelDailyReminder();
    return;
  }

  await Notifications.cancelScheduledNotificationAsync(REMINDER_IDENTIFIER).catch(() => undefined);

  const todaysSession = await getTodaysSession().catch(() => null);
  const hasPracticedToday = todaysSession?.status === "done";
  const nextDate = computeNextReminderDate(settings.hour, hasPracticedToday);

  const body = REMINDER_MESSAGES[Math.floor(Math.random() * REMINDER_MESSAGES.length)];
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_IDENTIFIER,
    content: {
      title: "Speech Coach",
      body,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: nextDate,
    },
  });
  logger.info(`[reminders] armed for ${nextDate.toLocaleString()}`);
}

export async function cancelDailyReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_IDENTIFIER).catch(() => undefined);
  logger.info("[reminders] cancelled daily reminder");
}
