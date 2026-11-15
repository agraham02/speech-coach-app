import * as Notifications from "expo-notifications";
import { getReminderSettings, getRewindReminder, getUserProfile, markRewindNotificationAsked, wasRewindNotificationAsked } from "../prefs/prefsStore";
import { rewindReminderText } from "../../domain/notificationCopy";
import { hasRewindOn } from "../db/rewindRepo";
import { getRewindWindow } from "./rewindTiming";
import { dateOffset } from "../../domain/rewind/rewindTiming";
import { REMINDER_DAYS_AHEAD, rewindReminderDates, rewindReminderHour } from "../../domain/rewind/reminder";
import { requestNotificationPermission } from "../notifications/reminderScheduler";
import { logger } from "../../utils/logger";

const IDENTIFIER = "rewind-reminder";

export async function cancelRewindReminder(): Promise<void> {
  for (let i = 0; i < REMINDER_DAYS_AHEAD; i++) await Notifications.cancelScheduledNotificationAsync(`${IDENTIFIER}-${i}`).catch(() => undefined);
}

// Re-arms the nudge as one-shots (a recurring one would fire even on a day
// you've already told). It follows your Rewind time (D40): evening people are
// nudged at night to tell today, morning people in the morning to tell
// yesterday. Called on launch, when the setting
// changes and after a Rewind. With `askIfFirst`, the first finished Rewind
// asks once for notification permission.
export async function syncRewindReminder(options: { askIfFirst?: boolean } = {}): Promise<void> {
  const settings = getRewindReminder();
  await cancelRewindReminder();
  if (!settings.enabled) return;

  let allowed = (await Notifications.getPermissionsAsync()).granted;
  if (!allowed && options.askIfFirst && !wasRewindNotificationAsked()) {
    markRewindNotificationAsked();
    allowed = await requestNotificationPermission();
  }
  if (!allowed) return;

  const now = new Date();
  const window = await getRewindWindow(now).catch(() => "evening" as const);
  const practice = getReminderSettings();
  const hour = rewindReminderHour(window, settings.hour, practice.enabled ? practice.hour : null);
  const about = window === "morning" ? dateOffset(now, -1) : dateOffset(now, 0);
  const dates = rewindReminderDates({ hour, now, toldToday: await hasRewindOn(about).catch(() => false) });
  const name = getUserProfile()?.name;
  for (const [i, date] of dates.entries()) {
    const text = rewindReminderText(name, date, window === "morning" ? "yesterday" : "today");
    await Notifications.scheduleNotificationAsync({
      identifier: `${IDENTIFIER}-${i}`,
      content: { title: text.title, body: text.body, data: { route: "Rewind" } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
    });
  }
  logger.info(`[rewind] reminder armed for ${dates.length} ${window === "morning" ? "morning" : "evening"}(s) at ${hour}:00`);
}
