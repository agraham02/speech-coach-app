import * as Notifications from "expo-notifications";
import { getRewindReminder, markRewindNotificationAsked, wasRewindNotificationAsked } from "../prefs/prefsStore";
import { hasRewindToday } from "../db/rewindRepo";
import { REMINDER_DAYS_AHEAD, rewindReminderDates } from "../../domain/rewind/reminder";
import { requestNotificationPermission } from "../notifications/reminderScheduler";
import { logger } from "../../utils/logger";

const IDENTIFIER = "rewind-reminder";

const MESSAGES = [
  "Tell your day, morning to night — two minutes.",
  "Rewind: what happened today? Say it out loud, details and all.",
  "Two minutes to put your day into words.",
];

export async function cancelRewindReminder(): Promise<void> {
  for (let i = 0; i < REMINDER_DAYS_AHEAD; i++) await Notifications.cancelScheduledNotificationAsync(`${IDENTIFIER}-${i}`).catch(() => undefined);
}

// Re-arms the evening nudge as one-shots (a recurring one would fire even on
// a night you've already told your day). Called on launch, when the setting
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

  const dates = rewindReminderDates({ hour: settings.hour, now: new Date(), toldToday: await hasRewindToday().catch(() => false) });
  for (const [i, date] of dates.entries()) {
    await Notifications.scheduleNotificationAsync({
      identifier: `${IDENTIFIER}-${i}`,
      content: { title: "Tono", body: MESSAGES[(date.getDate() + i) % MESSAGES.length], data: { route: "Rewind" } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
    });
  }
  logger.info(`[rewind] reminder armed for ${dates.length} evening(s)`);
}
