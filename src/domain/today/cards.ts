import { dateFromISODate, daysBetween, isoDateFromDate } from "../../utils/dateUtils";

// Which cards Today shows, in what order and at what size (plan section 8).
// A pure function of a plain snapshot: the caller reads prefs, the database
// and the clock, and hands the facts in. Nothing here reads the real time,
// so the rules can be tested at any hour and any distance from an event
// (R24). Rewind's timing (when it is offered, and for which day) is decided
// elsewhere (plan 5.3) and arrives as data.

// ---------------------------------------------------------------------------
// Time of day

// Hour boundaries, on the 24-hour clock, in the user's local time.
//   morning: 05:00 up to 12:00
//   midday:  12:00 up to 17:00
//   evening: 17:00 through the small hours, up to 05:00
// The small hours count as evening so "5 minutes still counts tonight." still
// makes sense at 1 a.m., and Three things (morning only) never appears then.
export const MORNING_START_HOUR = 5;
export const MIDDAY_START_HOUR = 12;
export const EVENING_START_HOUR = 17;

export type TimeOfDay = "morning" | "midday" | "evening";

export function timeOfDay(now: Date): TimeOfDay {
  const hour = now.getHours();
  if (hour >= MORNING_START_HOUR && hour < MIDDAY_START_HOUR) return "morning";
  if (hour >= MIDDAY_START_HOUR && hour < EVENING_START_HOUR) return "midday";
  return "evening";
}

// ---------------------------------------------------------------------------
// Limits

// More than this many cards (full and tile) and the rest sit behind
// "Show N more". One-line cards under the session don't count: they take
// almost no room and never push anything else out.
export const MAX_VISIBLE_CARDS = 4;

// A Moment this many days out or fewer gets a full card; further out (up to
// MOMENT_LINE_DAYS) it is a line under the session.
export const MOMENT_FULL_DAYS = 3;
export const MOMENT_LINE_DAYS = 14;
// The day after a Moment, up to and including this many days, asks how it went.
export const MOMENT_AFTER_DAYS = 3;

// ---------------------------------------------------------------------------
// Input

export type SessionState = "not-started" | "in-progress" | "done";

export interface TakeFact {
  id: string;
  title: string;
  // working: being analysed. stuck: didn't finish. ready: finished.
  state: "working" | "stuck" | "ready";
  // Whether the result has been opened (only matters once it's ready).
  opened: boolean;
}

export interface MomentFact {
  id: string;
  // What to call it: "your pitch", or the title the user gave it.
  name: string;
  // YYYY-MM-DD, local.
  date: string;
  // The After page has been saved.
  debriefed: boolean;
  // "How did it go?" was dismissed without saving.
  dismissed: boolean;
}

export interface RewindOffer {
  // Which day Rewind would be about.
  day: "today" | "yesterday";
  // YYYY-MM-DD of that day.
  date: string;
}

export interface TodayCardsInput {
  now: Date;

  // The session card.
  session: {
    state: SessionState;
    // The user's anchor line ("After your coffee."), if they set one.
    anchorLine: string | null;
  };

  takes: TakeFact[];
  moments: MomentFact[];

  rewind: {
    // Already decided by Rewind's own timing (plan 5.3); null: nothing to tell.
    offer: RewindOffer | null;
    // Rewind is already a step in a session that isn't finished.
    inUnfinishedSession: boolean;
  };

  threeThings: {
    // The user keeps that practice.
    keepsPractice: boolean;
    doneToday: boolean;
  };

  // This week's Feeling of the week rep is done. Pass true when the user
  // doesn't use the feature, so the card stays away.
  feelingOfWeekDone: boolean;

  // Missions, Prime, Debrief.
  openMissions: number;
  pendingDebrief: boolean;

  // A lesson is due for review. Null when none is.
  reviewDue: { lessonId: string; title: string; inTodaysSession: boolean } | null;

  // An unseen personal best or level-up.
  unseenProgress: { best: boolean; levelUp: boolean };

  // `snoozed`: pushed back by the user. Either one hides the card.
  skillCheck: { due: boolean; snoozed: boolean };
  comfortCheckIn: { due: boolean; snoozed: boolean };

  // The path changed after a goal or event change, and the notice isn't dismissed.
  pathChanged: boolean;

  // The streak just broke and isn't repaired or dismissed; `why` is the
  // user's own reason for practising.
  streak: { justBroke: boolean; why: string | null };

  modelInstalled: boolean;

  // Card ids the user swiped away for today.
  snoozedIds: readonly string[];
}

// ---------------------------------------------------------------------------
// Output

export type CardSize = "full" | "tile" | "line";

export interface CardAction {
  id: string;
  label: string;
}

export type MomentPhase = "soon" | "before" | "today" | "after";

interface CardBase {
  // Stable; also what a snooze remembers.
  id: string;
  size: CardSize;
}

export type TodayCard =
  | (CardBase & { kind: "takes"; takes: TakeFact[] })
  | (CardBase & {
      kind: "moment";
      phase: MomentPhase;
      momentId: string;
      name: string;
      date: string;
      // Whole days until the date: positive before, 0 on the day, negative after.
      daysUntil: number;
      // Whole days since the date (0 before and on the day).
      daysAgo: number;
      actions: CardAction[];
    })
  | (CardBase & { kind: "rewind"; day: "today" | "yesterday"; date: string; label: "Tell today" | "Tell yesterday" })
  | (CardBase & { kind: "three-things" })
  | (CardBase & { kind: "feeling-of-week" })
  | (CardBase & { kind: "missions"; openMissions: number; pendingDebrief: boolean })
  | (CardBase & { kind: "review-due"; lessonId: string; title: string })
  | (CardBase & { kind: "new-progress"; best: boolean; levelUp: boolean })
  | (CardBase & { kind: "skill-check" })
  | (CardBase & { kind: "comfort-check-in"; actions: CardAction[] })
  | (CardBase & { kind: "path-changed" })
  | (CardBase & { kind: "streak-repair"; why: string | null })
  | (CardBase & { kind: "model-download" });

export interface SessionLine {
  // The line under the session's title; null when there isn't one.
  text: string | null;
  // Buttons shown once the day's session is done.
  actions: CardAction[];
}

export interface TodayCards {
  timeOfDay: TimeOfDay;
  session: SessionLine;
  // Every card that applies, in rank order (snoozed ones left out).
  cards: TodayCard[];
  // What to show now: the first MAX_VISIBLE_CARDS full and tile cards, plus
  // every line, in rank order.
  visible: TodayCard[];
  // Full and tile cards behind "Show N more", in rank order.
  more: TodayCard[];
  // "Show 2 more", or null when nothing is hidden.
  moreLabel: string | null;
}

export const EVENING_SESSION_LINE = "5 minutes still counts tonight.";
export const SESSION_DONE_LINE = "Done for today ✓";
export const KEEP_GOING: CardAction = { id: "keep-going", label: "Keep going" };
export const SOMETHING_ELSE: CardAction = { id: "something-else", label: "Something else" };

// ---------------------------------------------------------------------------
// The session card's line

export function sessionLine(state: SessionState, anchorLine: string | null, when: TimeOfDay): SessionLine {
  if (state === "done") return { text: SESSION_DONE_LINE, actions: [KEEP_GOING, SOMETHING_ELSE] };
  if (when === "morning") return { text: anchorLine?.trim() || null, actions: [] };
  if (when === "evening" && state === "not-started") return { text: EVENING_SESSION_LINE, actions: [] };
  return { text: null, actions: [] };
}

// ---------------------------------------------------------------------------
// Ranking

// Full cards first, then tiles, then lines. Within a size, time-sensitive
// things first (lower sorts earlier):
//   Full: a Moment today, a Moment 1-3 days out, your take, streak repair,
//         a Moment's "How did it go?", new progress, Rewind (only card).
//   Tile: Rewind, Three things, missions, review due, Feeling of the week,
//         skill check, comfort check-in.
//   Line: Moment further out, path changed, model download.
const SIZE_ORDER: Record<CardSize, number> = { full: 0, tile: 1, line: 2 };

function rank(card: TodayCard): number {
  switch (card.kind) {
    case "moment":
      return { today: 0, before: 1, after: 4, soon: 13 }[card.phase];
    case "takes":
      return 2;
    case "streak-repair":
      return 3;
    case "new-progress":
      return 5;
    case "rewind":
      return 6;
    case "three-things":
      return 7;
    case "missions":
      return 8;
    case "review-due":
      return 9;
    case "feeling-of-week":
      return 10;
    case "skill-check":
      return 11;
    case "comfort-check-in":
      return 12;
    case "path-changed":
      return 14;
    case "model-download":
      return 15;
  }
}

function byRank(a: TodayCard, b: TodayCard): number {
  const bySize = SIZE_ORDER[a.size] - SIZE_ORDER[b.size];
  if (bySize !== 0) return bySize;
  const byKind = rank(a) - rank(b);
  if (byKind !== 0) return byKind;
  // Same kind and phase (several Moments): the nearest date first.
  if (a.kind === "moment" && b.kind === "moment") {
    const byDistance = Math.abs(a.daysUntil) - Math.abs(b.daysUntil);
    if (byDistance !== 0) return byDistance;
    return a.momentId < b.momentId ? -1 : a.momentId > b.momentId ? 1 : 0;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// The cards

function momentCards(moments: MomentFact[], today: string): TodayCard[] {
  const todayDate = dateFromISODate(today);
  const out: TodayCard[] = [];
  let soonest: Extract<TodayCard, { kind: "moment" }> | null = null;

  for (const m of moments) {
    const daysUntil = daysBetween(todayDate, dateFromISODate(m.date));
    const base = { kind: "moment" as const, momentId: m.id, name: m.name, date: m.date, daysUntil, daysAgo: Math.max(0, -daysUntil) };
    const id = `moment:${m.id}`;

    if (daysUntil > MOMENT_LINE_DAYS) continue;
    if (daysUntil > MOMENT_FULL_DAYS) {
      // Only the nearest further-out Moment gets its line.
      const line = { ...base, id, size: "line" as const, phase: "soon" as const, actions: [] };
      if (!soonest || daysUntil < soonest.daysUntil) soonest = line;
      continue;
    }
    if (daysUntil > 0) {
      out.push({ ...base, id, size: "full", phase: "before", actions: [{ id: "warm-up", label: "Warm up for it" }] });
    } else if (daysUntil === 0) {
      if (m.debriefed) continue;
      out.push({
        ...base,
        id,
        size: "full",
        phase: "today",
        actions: [
          { id: "warm-up", label: "Warm up for it" },
          { id: "check-in", label: "Check in" },
        ],
      });
    } else if (-daysUntil <= MOMENT_AFTER_DAYS) {
      if (m.debriefed || m.dismissed) continue;
      out.push({ ...base, id, size: "full", phase: "after", actions: [{ id: "debrief", label: "How did it go?" }] });
    }
  }
  if (soonest) out.push(soonest);
  return out;
}

function takeCards(takes: TakeFact[]): TodayCard[] {
  // Analysing, stuck, or ready but unopened.
  const shown = takes.filter((t) => t.state !== "ready" || !t.opened);
  return shown.length > 0 ? [{ id: "takes", kind: "takes", size: "full", takes: shown }] : [];
}

export function todayCards(input: TodayCardsInput): TodayCards {
  const { now } = input;
  const when = timeOfDay(now);
  const today = isoDateFromDate(now);
  const snoozed = new Set(input.snoozedIds);

  const cards: TodayCard[] = [...takeCards(input.takes), ...momentCards(input.moments, today)];

  if (input.streak.justBroke) cards.push({ id: "streak-repair", kind: "streak-repair", size: "full", why: input.streak.why });
  if (input.unseenProgress.best || input.unseenProgress.levelUp) {
    cards.push({ id: "new-progress", kind: "new-progress", size: "full", best: input.unseenProgress.best, levelUp: input.unseenProgress.levelUp });
  }
  if (when === "morning" && input.threeThings.keepsPractice && !input.threeThings.doneToday) {
    cards.push({ id: "three-things", kind: "three-things", size: "tile" });
  }
  if (!input.feelingOfWeekDone) cards.push({ id: "feeling-of-week", kind: "feeling-of-week", size: "tile" });
  if (input.openMissions > 0 || input.pendingDebrief) {
    cards.push({ id: "missions", kind: "missions", size: "tile", openMissions: input.openMissions, pendingDebrief: input.pendingDebrief });
  }
  if (input.reviewDue && !input.reviewDue.inTodaysSession) {
    cards.push({ id: "review-due", kind: "review-due", size: "tile", lessonId: input.reviewDue.lessonId, title: input.reviewDue.title });
  }
  if (input.skillCheck.due && !input.skillCheck.snoozed) cards.push({ id: "skill-check", kind: "skill-check", size: "tile" });
  if (input.comfortCheckIn.due && !input.comfortCheckIn.snoozed) {
    cards.push({ id: "comfort-check-in", kind: "comfort-check-in", size: "tile", actions: [{ id: "check-in", label: "Check in" }] });
  }
  if (input.pathChanged) cards.push({ id: "path-changed", kind: "path-changed", size: "line" });
  if (!input.modelInstalled) cards.push({ id: "model-download", kind: "model-download", size: "line" });

  const live = cards.filter((c) => !snoozed.has(c.id));

  // Rewind is a tile, or full when nothing else (bar one-line cards) is
  // showing. Decided after the rest, so a snooze elsewhere can promote it.
  const { offer, inUnfinishedSession } = input.rewind;
  if (offer && !inUnfinishedSession && !snoozed.has("rewind")) {
    const onlyCard = !live.some((c) => c.size !== "line");
    live.push({
      id: "rewind",
      kind: "rewind",
      size: onlyCard ? "full" : "tile",
      day: offer.day,
      date: offer.date,
      label: offer.day === "today" ? "Tell today" : "Tell yesterday",
    });
  }

  const ranked = live.sort(byRank);

  const grid = ranked.filter((c) => c.size !== "line");
  const hidden = new Set(grid.slice(MAX_VISIBLE_CARDS));
  const more = ranked.filter((c) => hidden.has(c));
  const visible = ranked.filter((c) => !hidden.has(c));

  return {
    timeOfDay: when,
    session: sessionLine(input.session.state, input.session.anchorLine, when),
    cards: ranked,
    visible,
    more,
    moreLabel: more.length > 0 ? `Show ${more.length} more` : null,
  };
}
