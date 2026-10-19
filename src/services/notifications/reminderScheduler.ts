import * as Notifications from "expo-notifications";
import { reminderHours } from "../../domain/reminderSettings";
import { reminderDates } from "../../domain/dailyGoal";
import { daysUntil, reminderText } from "../../domain/notificationCopy";
import { getDailySessionGoal, getNextEvent, getPracticeAnchor, getPracticeAnchorHour, getReminderSettings, getUserProfile } from "../prefs/prefsStore";
import { getSessionsDoneToday, getStreakState } from "../db/progressRepo";
import { logger } from "../../utils/logger";

const REMINDER_IDENTIFIER = "daily-practice-reminder";

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

// Re-arms the practice reminders as one-shot notifications — one for each of
// today's remaining sessions (daily goal) whose hour hasn't passed and that
// isn't done yet, plus the first session of the next practice day. One-shots
// (rather than recurring DAILY triggers, which fire unconditionally) are what
// let a session you've already done skip its nudge — so this is called again
// whenever that could have changed: settings, a finished session or step,
// and every launch (see SettingsScreen, practiceEvents and AppNavigator).
export async function syncDailyReminder(): Promise<void> {
  const settings = getReminderSettings();
  await cancelDailyReminder();
  if (!settings.enabled) return;

  const goal = getDailySessionGoal();
  const doneToday = await getSessionsDoneToday().catch(() => 0);
  const dates = reminderDates(reminderHours(settings, goal), doneToday, new Date(), settings.practiceDays ?? []);
  const anchor = getPracticeAnchor();
  const profile = getUserProfile();
  const streak = await getStreakState().then((s) => s.currentStreak).catch(() => 0);
  const nextEvent = getNextEvent();
  const eventDays = nextEvent ? daysUntil(nextEvent.date, new Date()) : NaN;

  for (const [i, date] of dates.entries()) {
    const today = isToday(date);
    const slot = today ? Math.min(doneToday, goal - 1) + i : 0;
    // A reminder for a later day only knows the streak if today's rep is done.
    const text = reminderText({
      name: profile?.name,
      slot,
      anchor,
      anchorHour: getPracticeAnchorHour(),
      streak: today || doneToday > 0 ? streak : 0,
      atRiskToday: today && doneToday === 0,
      when: date,
      event: nextEvent && Number.isFinite(eventDays) ? { daysLeft: daysUntil(nextEvent.date, date), kind: nextEvent.kind } : null,
    });
    await Notifications.scheduleNotificationAsync({
      identifier: `${REMINDER_IDENTIFIER}-${i}`,
      content: { title: text.title, body: text.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
    });
  }
  logger.info(`[reminders] armed ${dates.map((d) => d.toLocaleString()).join(", ")}`);
}

function isToday(date: Date): boolean {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

const MAX_REMINDERS = 4;

export async function cancelDailyReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_IDENTIFIER).catch(() => undefined);
  for (let i = 0; i < MAX_REMINDERS; i++) {
    await Notifications.cancelScheduledNotificationAsync(`${REMINDER_IDENTIFIER}-${i}`).catch(() => undefined);
  }
}
