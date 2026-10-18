import type { EventKind } from "./profile";
import { dateFromISODate, daysBetween } from "../utils/dateUtils";

// Things you're speaking at: an interview, a talk, a toast. You can have
// several. The soonest one still ahead is what the plan, prompts, reminders
// and reviews lean toward. Around each one there's a check-in before (how
// nervous you expect to be, and one thing to do well) and after (how it
// actually felt, what went okay, one thing to try next time). Nothing is
// graded: the after check-in only sets what you feared next to what happened,
// because the gap is usually in your favor. Pure.

export interface BeforeCheckIn {
  // 0-10, null when skipped.
  nerves: number | null;
  focus: string;
  at: string;
}

export interface AfterCheckIn {
  nerves: number | null;
  wentOkay: string;
  tryNext: string;
  at: string;
}

export interface SpeakingEvent {
  id: string;
  kind: EventKind;
  title: string | null;
  // YYYY-MM-DD, local.
  date: string;
  createdAt: string;
  before: BeforeCheckIn | null;
  after: AfterCheckIn | null;
}

// The soonest event still ahead, mirrored into prefs for the synchronous
// readers (plan, prompts, reminder copy, review context).
export interface UpcomingEvent {
  id: string;
  kind: EventKind;
  title: string | null;
  date: string;
}

// How long after an event Today keeps asking how it went.
export const DEBRIEF_DAYS = 7;

export type EventPhase = "upcoming" | "today" | "debrief" | "done";

export const EVENT_NOUNS: Record<EventKind, string> = {
  interview: "interview",
  talk: "talk",
  toast: "toast",
  pitch: "pitch",
  date: "date",
  other: "big day",
};

// "your pitch", or what you called it.
export function eventName(event: { kind: EventKind; title: string | null }): string {
  return event.title?.trim() || EVENT_NOUNS[event.kind];
}

export function daysAway(date: string, today: string): number {
  return daysBetween(dateFromISODate(today), dateFromISODate(date));
}

export function eventPhase(event: SpeakingEvent, today: string): EventPhase {
  if (event.date > today) return "upcoming";
  if (event.after) return "done";
  if (event.date === today) return "today";
  return daysAway(today, event.date) <= DEBRIEF_DAYS ? "debrief" : "done";
}

// "today", "tomorrow", "in 5 days".
export function countdownLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export function upcomingEvent(events: SpeakingEvent[], today: string): UpcomingEvent | null {
  const next = events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))[0];
  return next ? { id: next.id, kind: next.kind, title: next.title, date: next.date } : null;
}

// Upcoming soonest-first, then past newest-first.
export function sortEvents(events: SpeakingEvent[], today: string): { upcoming: SpeakingEvent[]; past: SpeakingEvent[] } {
  const upcoming = events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = events.filter((e) => e.date < today).sort((a, b) => b.date.localeCompare(a.date));
  return { upcoming, past };
}

export interface BannerPick {
  event: SpeakingEvent;
  phase: Exclude<EventPhase, "done">;
  // Other events still open (ahead, today, or waiting for an after check-in).
  others: number;
}

// The one event Today shows: one happening today first, then one waiting to
// be told how it went (newest), then the next one ahead.
export function bannerEvent(events: SpeakingEvent[], today: string): BannerPick | null {
  const open = events.map((event) => ({ event, phase: eventPhase(event, today) })).filter((x) => x.phase !== "done");
  const rank = { today: 0, debrief: 1, upcoming: 2 } as const;
  open.sort((a, b) => {
    const r = rank[a.phase as keyof typeof rank] - rank[b.phase as keyof typeof rank];
    if (r) return r;
    return a.phase === "debrief" ? b.event.date.localeCompare(a.event.date) : a.event.date.localeCompare(b.event.date);
  });
  const first = open[0];
  if (!first) return null;
  return { event: first.event, phase: first.phase as BannerPick["phase"], others: open.length - 1 };
}

// What you expected next to what happened, for after the after check-in.
export function nervesSummary(before: number | null | undefined, after: number | null | undefined): string | null {
  if (before == null || after == null) return null;
  if (after < before) return `You expected ${before} out of 10, it felt like ${after}. Easier than you feared.`;
  if (after === before) return `You expected ${before} out of 10, and it was about that. You called it.`;
  return `You expected ${before} out of 10, it felt like ${after}. Harder than expected, and you did it anyway.`;
}

// --- reminders -------------------------------------------------------------

export interface EventReminder {
  eventId: string;
  kind: EventKind;
  phase: "before" | "after";
  date: Date;
}

const DAY_OF_HOUR = 8;
const DAY_AFTER_HOUR = 12;
// Only the next month's events get armed: the OS caps pending notifications
// (64 on iOS), and every launch re-arms them anyway.
const HORIZON_DAYS = 31;
const MAX_REMINDERS = 8;

// The morning of each event (unless you've already checked in before it),
// and midday the day after (unless you've said how it went).
export function eventReminderPlan(events: SpeakingEvent[], now: Date): EventReminder[] {
  const out: EventReminder[] = [];
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);
  for (const e of [...events].sort((a, b) => a.date.localeCompare(b.date))) {
    const day = dateFromISODate(e.date);
    const dayOf = new Date(day.getFullYear(), day.getMonth(), day.getDate(), DAY_OF_HOUR);
    const after = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, DAY_AFTER_HOUR);
    if (!e.before && dayOf > now && dayOf <= horizon) out.push({ eventId: e.id, kind: e.kind, phase: "before", date: dayOf });
    if (!e.after && after > now && after <= horizon) out.push({ eventId: e.id, kind: e.kind, phase: "after", date: after });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, MAX_REMINDERS);
}
