import type { EventKind } from "./profile";

// What Tono's notifications say. Pure: the schedulers gather the facts (name,
// streak, upcoming event, the hour it will arrive) and this picks the words.
//
// Rules the copy keeps:
// - Notifications show on the lock screen, so they use only the first name,
//   the streak and the kind of event. Never the "why", an event's note, or
//   anything the person said or was scored on.
// - Pick by day, not at random: the same facts give the same words (testable),
//   and consecutive days still differ.
// - Never guilt. A streak at risk is stated as a fact with a way to save it.

export interface ReminderContext {
  name?: string | null;
  // 0 is the day's first session; 1 and up are the optional top-ups.
  slot: number;
  // "After my morning coffee": the habit practice is tied to.
  anchor: string | null;
  // The streak as it will stand when this arrives (0 when it will have lapsed
  // or the person has not practiced yet today).
  streak: number;
  // Nothing done yet today, and this arrives today.
  atRiskToday: boolean;
  // When it arrives.
  when: Date;
  event?: { daysLeft: number; kind: EventKind } | null;
}

export interface NotificationText {
  title: string;
  body: string;
}

// "Sam Rivera" -> "Sam". Names are free text, so be forgiving.
export function firstName(name?: string | null): string | null {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return first.length > 0 && first.length <= 24 ? first : null;
}

function daypart(hour: number): string {
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

// A whole number that changes every day, to rotate through a pool.
function dayNumber(date: Date): number {
  return Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 86_400_000);
}

function pick<T>(pool: readonly T[], date: Date, salt = 0): T {
  return pool[(dayNumber(date) + salt) % pool.length];
}

const EVENT_NOUN: Record<EventKind, string> = {
  interview: "interview",
  talk: "talk",
  toast: "toast",
  pitch: "pitch",
  date: "date",
  other: "big day",
};

function eventLine(event: { daysLeft: number; kind: EventKind }, who: string | null): string | null {
  const noun = EVENT_NOUN[event.kind];
  const you = who ? `${who}, ` : "";
  if (event.daysLeft < 0 || event.daysLeft > 14) return null;
  if (event.daysLeft === 0) return `${you}today's the day. A short warm-up rep before your ${noun}?`;
  if (event.daysLeft === 1) return `${you}your ${noun} is tomorrow. One calm run-through tonight.`;
  if (event.daysLeft <= 3) return `${event.daysLeft} days to your ${noun}. Today's rep is part of the plan.`;
  return `${event.daysLeft} days until your ${noun}. Every rep counts toward it.`;
}

const FIRST_SESSION = [
  (who: string | null) => (who ? `${who}, today's practice is ready when you are.` : "Today's practice is ready when you are."),
  () => "One response, a few minutes. Today's rep is waiting.",
  (who: string | null) => (who ? `A few minutes for yourself, ${who}? Pick a prompt and go.` : "A few minutes for yourself? Pick a prompt and go."),
  () => "Small reps add up. Today's is ready.",
];

const TOP_UPS = [
  (who: string | null) => (who ? `Quick top-up, ${who}? Four minutes on something new.` : "Quick top-up? Four minutes on something new."),
  () => "A short second session. Spacing practice out is what makes it stick.",
  () => "Four more minutes while it's fresh?",
];

const WEEKDAY: Partial<Record<number, string>> = {
  1: "New week. Start it with one rep.",
  5: "Friday. End the week on a rep you're proud of.",
};

export function reminderText(ctx: ReminderContext): NotificationText {
  const who = firstName(ctx.name);
  const title = who ? `${daypart(ctx.when.getHours())}, ${who}` : "Tono";

  if (ctx.slot > 0) return { title, body: pick(TOP_UPS, ctx.when, ctx.slot)(who) };

  const event = ctx.event ? eventLine(ctx.event, who) : null;
  if (event) return { title, body: event };

  // The streak is the strongest nudge when it is actually in danger.
  if (ctx.atRiskToday && ctx.streak >= 3) {
    return { title, body: `Your ${ctx.streak}-day streak is waiting on today's rep. A short one counts.` };
  }
  if (ctx.streak >= 2 && !ctx.atRiskToday) {
    return { title, body: `Day ${ctx.streak + 1} is ready. ${pick(["Keep it going.", "Same time, same rep.", "One response is all it takes."], ctx.when)}` };
  }

  if (ctx.anchor) return { title, body: `${ctx.anchor.replace(/[.!?\s]+$/, "")}: time for today's practice.` };

  const weekday = WEEKDAY[ctx.when.getDay()];
  if (weekday && dayNumber(ctx.when) % 2 === 0) return { title, body: weekday };
  return { title, body: pick(FIRST_SESSION, ctx.when)(who) };
}

// The evening "tell your day" nudge.
export function rewindReminderText(name: string | null | undefined, when: Date): NotificationText {
  const who = firstName(name);
  const pool = [
    who ? `${who}, tell your day, morning to night. Two minutes.` : "Tell your day, morning to night. Two minutes.",
    "Rewind: what happened today? Say it out loud, details and all.",
    who ? `Two minutes to put your day into words, ${who}.` : "Two minutes to put your day into words.",
  ];
  return { title: who ? `Evening, ${who}` : "Tono", body: pick(pool, when) };
}

// The morning of an event, until the before check-in is done.
export function eventDayOfText(name: string | null | undefined, kind: EventKind): NotificationText {
  const who = firstName(name);
  return { title: who ? `Today's the day, ${who}` : "Today's the day", body: `Your ${EVENT_NOUN[kind]} is today. A minute to check in before it?` };
}

// The day after, until the after check-in is done.
export function eventAfterText(name: string | null | undefined, kind: EventKind): NotificationText {
  const who = firstName(name);
  return { title: who ? `${who}, how did it go?` : "How did it go?", body: `Your ${EVENT_NOUN[kind]} was yesterday. Two minutes to say how it actually felt.` };
}

// A finished review or analysis, when the app was in the background.
export function sessionReadyText(name: string | null | undefined, overall: number | null): NotificationText {
  const who = firstName(name);
  if (overall == null) {
    return { title: who ? `${who}, your take is ready` : "Your take is ready", body: "Your pace, pauses and fillers are in. Tap to see them." };
  }
  const rounded = Math.round(overall * 10) / 10;
  const lead = rounded >= 8 ? "Strong take" : rounded >= 6 ? "Solid take" : "Useful take";
  return {
    title: who ? `${lead}, ${who}` : lead,
    body: `Your deep review is in: ${rounded}/10 overall. Tap to see what stood out and what to try next.`,
  };
}

// Whole days from `from` to a YYYY-MM-DD date, by local calendar day (0 is
// the same day). NaN for a date that cannot be read.
export function daysUntil(isoDate: string, from: Date): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return NaN;
  const target = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}
