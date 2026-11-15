import { isoDateFromDate } from "../../utils/dateUtils";

// Which day Rewind offers right now, and when you like to practise
// (docs/overhaul/PLAN.md, 5.3 "Rewind works at any hour"). Pure.
//
// - Evening, from REWIND_EVENING_FROM_HOUR until you've told it: "Rewind today".
// - Morning or midday, if yesterday wasn't told: "Rewind yesterday".
// - Each day can be told once, and a day older than yesterday is never offered.
// - The app learns your habit from the activity log (14 days). A morning
//   practiser is nudged in the morning about yesterday and isn't asked to tell
//   the same day twice that night; an evening practiser is nudged at night.
//   Settings can override what it learned.

export type RewindDay = "today" | "yesterday";
// When you usually practise.
export type RewindWindow = "morning" | "evening";
// The Settings choice: "auto" follows the habit.
export type RewindTimeSetting = "auto" | "morning" | "evening";

export const REWIND_TIME_OPTIONS: { key: RewindTimeSetting; label: string; detail: string }[] = [
  { key: "auto", label: "Auto", detail: "Follows when you usually practise" },
  { key: "morning", label: "Morning", detail: "Tell yesterday, first thing" },
  { key: "evening", label: "Evening", detail: "Tell today, at night" },
];

// From this local hour, today is ready to be told (matches the old evening
// card, labels.ts REWIND_CARD_FROM_HOUR). Before it, it's yesterday's turn.
export const REWIND_EVENING_FROM_HOUR = 18;

export interface RewindOffer {
  // Local YYYY-MM-DD of the day to tell (what `day_recalls.date` gets).
  date: string;
  day: RewindDay;
}

export interface RewindOfferInput {
  now: Date;
  window: RewindWindow;
  // Local YYYY-MM-DD of every day already told (failed takes count: you told it).
  toldDates: Iterable<string>;
  eveningFromHour?: number;
}

export function dateOffset(now: Date, days: number): string {
  return isoDateFromDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
}

// The day to offer now, or null when nothing applies. A morning practiser who
// is past the morning gets nothing until tomorrow's yesterday: one Rewind a
// day, told the morning after.
export function decideRewindOffer({ now, window, toldDates, eveningFromHour = REWIND_EVENING_FROM_HOUR }: RewindOfferInput): RewindOffer | null {
  const told = new Set(toldDates);
  if (now.getHours() >= eveningFromHour) {
    if (window === "morning") return null;
    const date = dateOffset(now, 0);
    return told.has(date) ? null : { date, day: "today" };
  }
  const date = dateOffset(now, -1);
  return told.has(date) ? null : { date, day: "yesterday" };
}

// Whether the day to tell is still open on a given date, for a screen that was
// asked for a particular day (a notification, a card).
export function canTellDay(day: RewindDay, now: Date, toldDates: Iterable<string>): boolean {
  const told = new Set(toldDates);
  return !told.has(dateOffset(now, day === "today" ? 0 : -1));
}

// ---------------------------------------------------------------------------
// Habit
// ---------------------------------------------------------------------------

// Local-hour boundaries. 4:00 to 11:59 is morning; 17:00 to 3:59 is evening
// (late-night practice belongs to the evening before); 12:00 to 16:59 is
// midday and counts for neither side.
export const MORNING_FROM_HOUR = 4;
export const MORNING_UNTIL_HOUR = 12;
export const EVENING_FROM_HOUR = 17;

export const HABIT_DAYS = 14;
// At least this many practised halves of a day (the morning of one day is one,
// the evening of the same day another) before we call it a habit. Fewer:
// evening.
export const HABIT_MIN_SESSIONS = 4;
// Morning wins at this share of morning plus evening sessions or more.
export const HABIT_MORNING_SHARE = 0.6;

type Half = "morning" | "midday" | "evening";

export function halfOfDay(hour: number): Half {
  if (hour >= MORNING_FROM_HOUR && hour < MORNING_UNTIL_HOUR) return "morning";
  if (hour >= EVENING_FROM_HOUR || hour < MORNING_FROM_HOUR) return "evening";
  return "midday";
}

// When you practise, from the instants (ISO) of what you did in the last 14
// days. Each local day counts once per half of the day, so one long evening of
// ten drills is one evening, not ten. Too little data: evening.
export function detectRewindWindow(times: Iterable<string>, now: Date = new Date()): RewindWindow {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (HABIT_DAYS - 1)).getTime();
  const seen = new Set<string>();
  let morning = 0;
  let evening = 0;
  for (const iso of times) {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime()) || at.getTime() < from || at.getTime() > now.getTime()) continue;
    const half = halfOfDay(at.getHours());
    if (half === "midday") continue;
    const key = `${isoDateFromDate(at)}|${half}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (half === "morning") morning++;
    else evening++;
  }
  const total = morning + evening;
  if (total < HABIT_MIN_SESSIONS) return "evening";
  return morning / total >= HABIT_MORNING_SHARE ? "morning" : "evening";
}

// The setting wins; "auto" follows the habit.
export function resolveRewindWindow(setting: RewindTimeSetting, times: Iterable<string>, now: Date = new Date()): RewindWindow {
  return setting === "auto" ? detectRewindWindow(times, now) : setting;
}

// ---------------------------------------------------------------------------
// Words, in the right tense
// ---------------------------------------------------------------------------

// Which day a take is about, from the day it was told about and the day it was
// recorded: told on the day itself is "today"; any earlier day is "yesterday".
export function rewindAboutDay(date: string, recordedAt: string): RewindDay {
  const recorded = new Date(recordedAt);
  if (Number.isNaN(recorded.getTime())) return "today";
  return date < isoDateFromDate(recorded) ? "yesterday" : "today";
}

export interface RewindWords {
  title: string; // the big line on the recording screen
  sub: string;
  hero: string; // the Rewind screen's headline
  heroBody: string;
  start: string; // button
  cues: Record<"morning" | "midday" | "evening", string>;
}

export function rewindWords(day: RewindDay): RewindWords {
  if (day === "yesterday") {
    return {
      title: "Tell me about yesterday",
      sub: "Morning to night, as it went. Details, however small.",
      hero: "Say yesterday out loud",
      heroBody: "One to two minutes, morning to night. The aim isn't to sound good. It's to recall and describe: as much as you can find about yesterday, however ordinary.",
      start: "Tell yesterday",
      cues: { morning: "Yesterday morning", midday: "Yesterday midday", evening: "Yesterday evening" },
    };
  }
  return {
    title: "Tell me about your day",
    sub: "Morning to night. Details, however small.",
    hero: "Say your whole day out loud",
    heroBody: "One to two minutes, morning to night. The aim isn't to sound good. It's to recall and describe: as much detail as you can find, however ordinary.",
    start: "Tell today",
    cues: { morning: "Morning", midday: "Midday", evening: "Evening" },
  };
}
