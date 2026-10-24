import type { EventKind } from "./profile";
import { ANCHOR_OPTIONS } from "../content/onboarding";

// What Tono's notifications say. Pure: the schedulers gather the facts (name,
// streak, the next event, the hour it will arrive, what was practiced last)
// and this picks the words. Every notification the app sends gets its text
// here, so the voice stays one voice.
//
// The voice: a calm coach who was in the room.
// - Notice one real thing (the hour, the streak, the event, the last lesson),
//   then offer one small step. Observation first, invitation second.
// - Specific over generic: "Day 8", "3 days to your interview", not "Keep it up".
// - Invite, never instruct or guilt: no "Don't forget", "You need to", "Time to".
//   A streak at risk is a fact with a way to keep it, never a warning.
// - Say how little it takes ("one short rep", "two minutes").
// - Plain and quiet: sentence case, no emoji, no exclamation marks, no hype
//   words. One or two short sentences; it has to read on a lock screen.
//
// Rules the copy keeps:
// - Lock-screen safe: only the first name, the streak, the kind of event and
//   curriculum text (a lesson's title). Never the "why", an event's title or
//   note, a score, or anything the person said.
// - Deterministic: picked by day from a small pool, so the same facts give
//   the same words (testable), consecutive days differ, and nothing is
//   generated on the fly. A future generator (an on-device model, say) could
//   take the same facts and must pass the same `checkCopy` limits.

export interface ReminderContext {
  name?: string | null;
  // 0 is the day's first session; 1 and up are the optional top-ups.
  slot: number;
  // Sessions already done today when this was scheduled (today's reminders).
  // A top-up slot whose earlier session isn't done reads as the first one.
  doneToday?: number;
  // "After my morning coffee": the habit practice is tied to.
  anchor: string | null;
  // The hour of a habit the person wrote themselves.
  anchorHour?: number | null;
  // The streak as it will stand when this arrives (0 when it will have lapsed
  // or the person has not practiced yet today).
  streak: number;
  // Nothing done yet today, and this arrives today.
  atRiskToday: boolean;
  // Streak freezes in hand: a missed day would be covered.
  freezesHeld?: number;
  // When it arrives.
  when: Date;
  event?: { daysLeft: number; kind: EventKind } | null;
  // Whole days from the last practice to `when`; null if never practiced,
  // undefined if unknown.
  daysSinceLast?: number | null;
  // The title of the lesson finished most recently (curriculum text).
  lastLesson?: string | null;
}

// The habit an anchor is tied to happens at a time of day ("after your
// morning coffee" is a morning), so a line built on it only makes sense near
// that time. A reminder set for 7 PM must not say "after your morning
// coffee". Matches the anchor to one of the known habits by its words, so it
// survives "my" versus "your" and trailing punctuation; a habit it doesn't
// recognize can't be placed in the day, so it's never used.
const ANCHOR_WINDOW_HOURS = 2;

function plainAnchor(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\b(my|your)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// The ready-made habit an anchor's words match, if any.
export function anchorOption(anchor: string | null | undefined) {
  if (!anchor) return undefined;
  const plain = plainAnchor(anchor);
  return ANCHOR_OPTIONS.find((o) => plainAnchor(o.anchor) === plain);
}

// When the habit happens: a ready-made one knows; one the person wrote was
// tied to the hour they chose for their reminder (`savedHour`).
export function anchorHour(anchor: string | null | undefined, savedHour?: number | null): number | null {
  if (!anchor) return null;
  return anchorOption(anchor)?.hour ?? savedHour ?? null;
}

export function anchorFits(anchor: string | null | undefined, when: Date, savedHour?: number | null): boolean {
  const hour = anchorHour(anchor, savedHour);
  return hour != null && Math.abs(when.getHours() - hour) <= ANCHOR_WINDOW_HOURS;
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

type Daypart = "morning" | "afternoon" | "evening";

function daypart(hour: number): Daypart {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

// "Morning, Sam", or "Good morning" without a name.
function greeting(when: Date, who: string | null): string {
  const part = daypart(when.getHours());
  const word = part.charAt(0).toUpperCase() + part.slice(1);
  return who ? `${word}, ${who}` : `Good ${part}`;
}

// A whole number that changes every day, to rotate through a pool.
function dayNumber(date: Date): number {
  return Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 86_400_000);
}

function pick<T>(pool: readonly T[], date: Date, salt = 0): T {
  return pool[(dayNumber(date) + salt) % pool.length];
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

const EVENT_NOUN: Record<EventKind, string> = {
  interview: "interview",
  talk: "talk",
  toast: "toast",
  pitch: "pitch",
  date: "date",
  other: "big day",
};

// The countdown to an event, two weeks out at most.
function eventText(event: { daysLeft: number; kind: EventKind }, when: Date): NotificationText | null {
  const noun = EVENT_NOUN[event.kind];
  const n = event.daysLeft;
  if (n < 0 || n > 14) return null;
  if (n === 0) {
    return {
      title: `Today's your ${noun}`,
      body: pick(["One easy warm-up rep before you go. The work is already done.", "A minute of warm-up, then trust your practice."], when),
    };
  }
  if (n === 1) {
    const today = daypart(when.getHours()) === "evening" ? "tonight" : "today";
    return {
      title: `Your ${noun} is tomorrow`,
      body: pick([`One calm run-through ${today} is plenty. Then rest.`, `Keep it light ${today}: one rep, out loud, start to finish.`], when),
    };
  }
  if (n <= 3) {
    return {
      title: `${plural(n, "day")} to your ${noun}`,
      body: pick(["Today's rep is part of the plan. Short is fine.", "Close now. A short rep today keeps it familiar."], when),
    };
  }
  return {
    title: `${plural(n, "day")} until your ${noun}`,
    body: pick(["Plenty of time. A few minutes today still adds up.", "Each short rep makes the real one feel more familiar."], when),
  };
}

const FIRST_EVER = [
  "Your first rep is one prompt and a minute of talking. Whenever you're ready.",
  "No warm-up needed for the first one. Pick a prompt and talk for a minute.",
  "Start small: one prompt, one minute, no wrong answers.",
];

const COMEBACK = [
  "No catching up needed. One short rep and you're back in it.",
  "It's been a few days. Start with something short; that's all it takes.",
  "Whenever you're ready, today's session is a fresh start.",
];

const GENERIC: Record<Daypart, readonly string[]> = {
  morning: [
    "Today's session is ready. A few minutes before the day fills up.",
    "One prompt, a few minutes, then on with your day.",
    "Today's rep is ready, before the day gets loud.",
    "A few minutes out loud now makes the rest of the day's talking easier.",
  ],
  afternoon: [
    "A few minutes for yourself this afternoon? Today's session is ready.",
    "A midday reset: one prompt, out loud.",
    "Today's session is ready whenever there's a gap.",
  ],
  evening: [
    "Today's session is still here if you have a few minutes.",
    "Wind down with one short rep. It doesn't need to be perfect.",
    "A few minutes before the day ends. One prompt is plenty.",
  ],
};

const TOP_UPS: Record<number, readonly string[]> = {
  1: [
    "One more short session? Spacing practice out is what makes it stick.",
    "A second, shorter round, on a different skill from earlier.",
    "A few more minutes while today's practice is still fresh?",
  ],
  2: ["Last one for today, if you want it. Short, and different again.", "A final few minutes, then you're done for the day."],
};

const WEEKDAY: Partial<Record<number, string>> = {
  1: "New week. One short rep to open it.",
  5: "Friday. End the week on a rep you're glad you did.",
};

export function reminderText(ctx: ReminderContext): NotificationText {
  const who = firstName(ctx.name);
  const title = greeting(ctx.when, who);
  const hour = ctx.when.getHours();

  // A later session of the day, once the first is done.
  const firstOpen = ctx.slot > 0 && ctx.doneToday === 0;
  if (ctx.slot > 0 && !firstOpen) return { title, body: pick(TOP_UPS[ctx.slot] ?? TOP_UPS[1], ctx.when, ctx.slot) };

  const event = ctx.event ? eventText(ctx.event, ctx.when) : null;
  if (event) return event;

  if (ctx.daysSinceLast === null) return { title, body: pick(FIRST_EVER, ctx.when) };

  // Back after a gap: no counting, no guilt.
  if (ctx.streak === 0 && ctx.daysSinceLast != null && ctx.daysSinceLast >= 3) {
    const lesson = ctx.lastLesson ? [`Last time was ${ctx.lastLesson}. A short rep brings it back.`] : [];
    return { title: "Pick up where you left off", body: pick([...COMEBACK, ...lesson], ctx.when) };
  }

  // The streak: in the evening, with nothing done yet, it's worth saying the
  // day is still open. Otherwise it's simply the next day of a run.
  if (ctx.atRiskToday && ctx.streak >= 3 && daypart(hour) === "evening") {
    const covered = (ctx.freezesHeld ?? 0) > 0;
    return {
      title: `Day ${ctx.streak + 1} is still open`,
      body: pick(
        [
          covered ? "One short rep keeps it going. If tonight gets away from you, a freeze has it covered." : "One short rep keeps it going. A minute counts.",
          "Still time tonight. Even one prompt keeps the run going.",
        ],
        ctx.when,
      ),
    };
  }
  // The habit they tied practice to, near its hour. On a run it takes turns
  // with the day count, so neither goes stale.
  const anchorOk = !!ctx.anchor && anchorFits(ctx.anchor, ctx.when, ctx.anchorHour);
  if (ctx.streak >= 2 && !(anchorOk && dayNumber(ctx.when) % 2 === 1)) {
    const day = ctx.streak + 1;
    const lesson = ctx.lastLesson && ctx.daysSinceLast === 1 ? [`Day ${day}. Yesterday was ${ctx.lastLesson}; today picks up from there.`] : [];
    return {
      title,
      body: pick([`Day ${day}. One short rep keeps the thread going.`, `Day ${day} is ready when you are.`, `${ctx.streak} days running. Same few minutes today.`, ...lesson], ctx.when),
    };
  }

  if (ctx.anchor && anchorOk) {
    const anchor = ctx.anchor.replace(/[.!?\s]+$/, "");
    return { title, body: pick([`${anchor}: a good moment for today's rep.`, `${anchor}, as planned. Today's session is ready.`], ctx.when) };
  }

  if (ctx.lastLesson && ctx.daysSinceLast === 1) {
    return { title, body: `Yesterday was ${ctx.lastLesson}. Today's session picks up from there.` };
  }

  const weekday = WEEKDAY[ctx.when.getDay()];
  if (weekday && dayNumber(ctx.when) % 2 === 0) return { title, body: weekday };
  return { title, body: pick(GENERIC[daypart(hour)], ctx.when) };
}

// The evening "tell your day" nudge.
export function rewindReminderText(name: string | null | undefined, when: Date): NotificationText {
  const who = firstName(name);
  const pool = [
    "How did today go? Tell it start to finish, in about two minutes.",
    "Rewind: say your day out loud, small details and all.",
    "Two minutes to put today into words, before it blurs.",
    "What happened today? Start with the morning and keep going.",
  ];
  return { title: who ? `Evening, ${who}` : "Good evening", body: pick(pool, when) };
}

// The morning of an event, until the before check-in is done.
export function eventDayOfText(name: string | null | undefined, kind: EventKind, when: Date = new Date()): NotificationText {
  const who = firstName(name);
  const noun = EVENT_NOUN[kind];
  return {
    title: who ? `${who}, today's your ${noun}` : `Today's your ${noun}`,
    body: pick(["A one-minute check-in before you go: how you feel, and one thing to keep in mind.", "Before it starts: a minute to notice how you feel and pick one focus."], when),
  };
}

// The day after, until the after check-in is done.
export function eventAfterText(name: string | null | undefined, kind: EventKind, when: Date = new Date()): NotificationText {
  const who = firstName(name);
  const noun = EVENT_NOUN[kind];
  return {
    title: who ? `${who}, how did your ${noun} go?` : `How did your ${noun} go?`,
    body: pick(["Two minutes to say how it felt. Not a score, a note for next time.", "Say how it actually went while it's fresh. It helps with the next one."], when),
  };
}

export type ReadyKind = "take" | "review" | "feeling";

// A finished analysis or Tono AI judgement, when the app was in the background.
// No score on the lock screen: the Result screen has it.
export function sessionReadyText(name: string | null | undefined, kind: ReadyKind): NotificationText {
  const who = firstName(name);
  if (kind === "feeling") return { title: "Saved", body: "Your feeling take is saved, just for you." };
  if (kind === "review") {
    return { title: who ? `${who}, Tono AI has judged your take` : "Tono AI has judged your take", body: "What landed, and one thing to try next time. Tap to read it." };
  }
  return { title: who ? `${who}, your take is ready` : "Your take is ready", body: "Pace, pauses and fillers are in. Tap to see what stood out." };
}

// The in-app toast after a take lands on a streak worth noticing: a
// milestone (3, 7, 14 days...) or a new longest run.
export function streakToastText(streak: number, kind: "milestone" | "record"): string {
  if (kind === "milestone") return streak >= 7 ? `${streak} days in a row. That's a habit now.` : `${streak} days in a row. Nice rhythm.`;
  return `${streak} days in a row, your longest yet.`;
}

// A step of the analysis failed while the app was in the background.
export function stepFailedText(stepLabel: string, message: string): NotificationText {
  const reason = message.trim().replace(/([^.!?])$/, "$1.");
  return { title: `${stepLabel} didn't finish`, body: `${reason} Open the take to try again.` };
}

// Research time ran out while you were in another app.
export function prepTimeUpText(prompt: string): NotificationText {
  return { title: "Time's up", body: `Your prompt is ready when you are: ${prompt}` };
}

// Android's ongoing notification while you research. It can't count down,
// so it names the end time rather than a "minutes left" that goes stale.
export function prepRunningText(backBy: string, prompt: string): NotificationText {
  return { title: `Researching · back by ${backBy}`, body: `Take your time. Your prompt: ${prompt}` };
}

function localDay(dateOrDatetime: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOrDatetime)) return dateOrDatetime;
  const d = new Date(dateOrDatetime);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// How long ago the last practice was, as of `when`, and the lesson finished
// that day (only then, so "yesterday was X" is true). Dates are YYYY-MM-DD
// or datetimes (UTC ones count on their local day). daysSinceLast is null
// when there has never been any practice.
export function recencyFacts(
  practiceDates: string[],
  lastLesson: { title: string; completedAt: string } | null,
  when: Date,
): { daysSinceLast: number | null; lastLesson: string | null } {
  const days = practiceDates.filter(Boolean).map(localDay).sort();
  const last = days[days.length - 1];
  if (!last) return { daysSinceLast: null, lastLesson: null };
  const daysSinceLast = daysUntil(localDay(when.toISOString()), new Date(Number(last.slice(0, 4)), Number(last.slice(5, 7)) - 1, Number(last.slice(8, 10))));
  return {
    daysSinceLast: Math.max(0, daysSinceLast),
    lastLesson: lastLesson && localDay(lastLesson.completedAt) === last ? lastLesson.title : null,
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

// Limits any notification text must meet, whoever wrote it: short enough for
// a lock screen, no emoji, no exclamation marks, no pushy openers.
export const COPY_LIMITS = { title: 50, body: 120 } as const;
const PUSHY = /\b(don't forget|you need to|you must|time to|hurry|last chance)\b/i;
const EMOJI = /\p{Extended_Pictographic}/u;

export function checkCopy(text: NotificationText): string[] {
  const problems: string[] = [];
  if (text.title.length > COPY_LIMITS.title) problems.push(`title over ${COPY_LIMITS.title} characters`);
  if (text.body.length > COPY_LIMITS.body) problems.push(`body over ${COPY_LIMITS.body} characters`);
  for (const part of [text.title, text.body]) {
    if (part.includes("!")) problems.push("exclamation mark");
    if (EMOJI.test(part)) problems.push("emoji");
    if (PUSHY.test(part)) problems.push("pushy phrasing");
  }
  return problems;
}
