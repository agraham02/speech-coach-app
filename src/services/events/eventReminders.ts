import * as Notifications from "expo-notifications";
import { eventReminderPlan, type SpeakingEvent } from "../../domain/events";
import { eventAfterText, eventDayOfText } from "../../domain/notificationCopy";
import { getUserProfile } from "../prefs/prefsStore";
import { logger } from "../../utils/logger";

const PREFIX = "speaking-event-";

export async function cancelEventReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  for (const n of scheduled) {
    if (n.identifier.startsWith(PREFIX)) await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => undefined);
  }
}

// Re-arms the check-in nudges around each event (domain/events.ts
// eventReminderPlan) as one-shots: the morning of, and the day after. Called
// on launch and after any change to an event. Never asks for permission
// itself; the event editor and onboarding's reminder step do that.
export async function syncEventReminders(events: SpeakingEvent[]): Promise<void> {
  await cancelEventReminders();
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  const plan = eventReminderPlan(events, new Date());
  const name = getUserProfile()?.name;
  for (const r of plan) {
    const text = r.phase === "before" ? eventDayOfText(name, r.kind, r.date) : eventAfterText(name, r.kind, r.date);
    await Notifications.scheduleNotificationAsync({
      identifier: `${PREFIX}${r.phase}-${r.eventId}`,
      content: { title: text.title, body: text.body, data: { route: "EventCheckIn", eventId: r.eventId, phase: r.phase } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.date },
    });
  }
  if (plan.length) logger.info(`[events] armed ${plan.length} check-in reminder(s)`);
}
