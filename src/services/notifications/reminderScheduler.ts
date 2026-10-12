import * as Notifications from "expo-notifications";
import { reminderHours } from "../../domain/reminderSettings";
import { reminderDates } from "../../domain/dailyGoal";
import { getDailySessionGoal, getPracticeAnchor, getReminderSettings } from "../prefs/prefsStore";
import { getSessionsDoneToday } from "../db/progressRepo";
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

  for (const [i, date] of dates.entries()) {
    const slot = isToday(date) ? Math.min(doneToday, goal - 1) + i : 0;
    await Notifications.scheduleNotificationAsync({
      identifier: `${REMINDER_IDENTIFIER}-${i}`,
      content: { title: "Tono", body: messageFor(slot, anchor) },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
    });
  }
  logger.info(`[reminders] armed ${dates.map((d) => d.toLocaleString()).join(", ")}`);
}

function isToday(date: Date): boolean {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function messageFor(slot: number, anchor: string | null): string {
  if (slot > 0) return TOP_UP_MESSAGES[Math.floor(Math.random() * TOP_UP_MESSAGES.length)];
  // The if-then plan from onboarding ("After my morning coffee…") makes the
  // nudge land on the habit it's tied to.
  if (anchor) return `${anchor} — time for today's practice.`;
  return REMINDER_MESSAGES[Math.floor(Math.random() * REMINDER_MESSAGES.length)];
}

const TOP_UP_MESSAGES = [
  "Quick top-up? Four minutes on something new.",
  "A short second session — spacing it out is what makes it stick.",
];

const MAX_REMINDERS = 4;

export async function cancelDailyReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_IDENTIFIER).catch(() => undefined);
  for (let i = 0; i < MAX_REMINDERS; i++) {
    await Notifications.cancelScheduledNotificationAsync(`${REMINDER_IDENTIFIER}-${i}`).catch(() => undefined);
  }
}
