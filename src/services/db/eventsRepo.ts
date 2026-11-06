import { getDatabase } from "./database";
import { generateId } from "../../utils/generateId";
import { todayISODate } from "../../utils/dateUtils";
import { upcomingEvent, type AfterCheckIn, type BeforeCheckIn, type SpeakingEvent } from "../../domain/events";
import { rowToSpeakingEvent, type SpeakingEventRow } from "./mappers";
import type { EventKind } from "../../domain/profile";
import { getUserProfile, setNextEvent, setUserProfile } from "../prefs/prefsStore";
import { syncEventReminders } from "../events/eventReminders";
import { logger } from "../../utils/logger";

// Things you're speaking at, with their before and after check-ins
// (domain/events.ts). Migration v29; v36 added how it went and the focus
// answer as their own columns. Every write re-syncs the "next event" mirror
// and the check-in reminders.

export async function listEvents(): Promise<SpeakingEvent[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SpeakingEventRow>(`SELECT * FROM speaking_events WHERE deleted_at IS NULL ORDER BY event_date ASC, created_at ASC`);
  return rows.map(rowToSpeakingEvent);
}

export async function getEvent(id: string): Promise<SpeakingEvent | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<SpeakingEventRow>(`SELECT * FROM speaking_events WHERE id = ? AND deleted_at IS NULL`, [id]);
  return row ? rowToSpeakingEvent(row) : null;
}

export interface EventInput {
  kind: EventKind;
  title: string | null;
  date: string;
}

export async function createEvent(input: EventInput): Promise<string> {
  const db = await getDatabase();
  const id = generateId();
  await db.runAsync(`INSERT INTO speaking_events (id, kind, title, event_date, created_at) VALUES (?, ?, ?, ?, ?)`, [
    id,
    input.kind,
    input.title?.trim() || null,
    input.date,
    new Date().toISOString(),
  ]);
  await syncEvents();
  return id;
}

export async function updateEvent(id: string, input: EventInput): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE speaking_events SET kind = ?, title = ?, event_date = ? WHERE id = ?`, [input.kind, input.title?.trim() || null, input.date, id]);
  await syncEvents();
}

// Soft delete; the check-in text goes right away, since you asked for it gone.
export async function deleteEvent(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE speaking_events SET deleted_at = ?, title = NULL, before_json = NULL, after_json = NULL, after_went = NULL, after_focus_result = NULL WHERE id = ?`, [new Date().toISOString(), id]);
  await syncEvents();
}

export async function saveBeforeCheckIn(id: string, checkIn: Omit<BeforeCheckIn, "at">): Promise<void> {
  const db = await getDatabase();
  const value: BeforeCheckIn = { nerves: checkIn.nerves, focus: checkIn.focus.trim(), at: new Date().toISOString() };
  await db.runAsync(`UPDATE speaking_events SET before_json = ? WHERE id = ?`, [JSON.stringify(value), id]);
  await syncEvents();
}

export async function saveAfterCheckIn(id: string, checkIn: Omit<AfterCheckIn, "at">): Promise<void> {
  const db = await getDatabase();
  const { went, focusResult, ...text } = checkIn;
  const value = { ...text, wentOkay: checkIn.wentOkay.trim(), tryNext: checkIn.tryNext.trim(), at: new Date().toISOString() };
  await db.runAsync(`UPDATE speaking_events SET after_json = ?, after_went = ?, after_focus_result = ? WHERE id = ?`, [JSON.stringify(value), went, focusResult, id]);
  await syncEvents();
}

// Onboarding used to keep one event in the profile. Moves it into the table
// once and clears it from the profile, so it's never imported twice.
async function importLegacyEvent(): Promise<void> {
  const profile = getUserProfile();
  const legacy = profile?.event;
  if (!profile || legacy === undefined) return;
  // Cleared before the first await: syncEvents runs from more than one place
  // at launch, and a second run must not see the event and import it again.
  const { event: _legacy, ...rest } = profile;
  setUserProfile(rest);
  if (!legacy) return;
  try {
    const db = await getDatabase();
    await db.runAsync(`INSERT INTO speaking_events (id, kind, title, event_date, created_at) VALUES (?, ?, ?, ?, ?)`, [
      generateId(),
      legacy.kind,
      legacy.note?.trim() || null,
      legacy.date,
      new Date().toISOString(),
    ]);
    logger.info("[events] imported the onboarding event");
  } catch (error) {
    // Put it back so the next launch tries again.
    const current = getUserProfile();
    if (current) setUserProfile({ ...current, event: legacy });
    throw error;
  }
}

// Refreshes what depends on the event list: the "next event" mirror (so a
// passed event hands over to the next one) and the check-in reminders.
// Called after every write, on launch, and when Today comes into focus.
export async function syncEvents(): Promise<SpeakingEvent[]> {
  await importLegacyEvent().catch((err) => logger.error(`[events] legacy import failed — ${(err as Error).message}`));
  const events = await listEvents();
  setNextEvent(upcomingEvent(events, todayISODate()));
  await syncEventReminders(events).catch((err) => logger.error(`[events] reminder sync failed — ${(err as Error).message}`));
  return events;
}
