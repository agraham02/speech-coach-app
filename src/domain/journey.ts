import type { SkillId } from "../theme/tokens";
import type { Stage } from "./levels";
import { dateFromISODate, daysBetween } from "../utils/dateUtils";

// Your journey, for the path finale: where you started, where you are, and
// what you did in between. Pure: services/path/journey.ts gathers the facts
// from the phone's own records (nothing here is sent anywhere).

export interface JourneySkill {
  skill: SkillId;
  // The stage the skill check placed you at (1 without a check), and now.
  startStage: Stage;
  nowStage: Stage;
  startRating: number;
  nowRating: number;
}

export interface JourneyTake {
  sessionId: string;
  // YYYY-MM-DD
  date: string;
  // The measured overall (0-10): the same formula for every take, so a first
  // and a latest take can be set side by side. Null when it wasn't scored.
  score: number | null;
}

export interface JourneyFacts {
  // The first day anything was practiced, YYYY-MM-DD.
  startedOn: string | null;
  takes: number;
  drills: number;
  // Minutes of recorded speaking in takes.
  speakingMinutes: number;
  practiceDays: number;
  longestStreak: number;
  skills: JourneySkill[];
  speakerLevelStart: number | null;
  speakerLevelNow: number | null;
  firstTake: JourneyTake | null;
  bestTake: JourneyTake | null;
  // The average measured overall of the latest takes, and how many that is.
  recentScore: number | null;
  recentCount: number;
}

export const EMPTY_JOURNEY: JourneyFacts = {
  startedOn: null,
  takes: 0,
  drills: 0,
  speakingMinutes: 0,
  practiceDays: 0,
  longestStreak: 0,
  skills: [],
  speakerLevelStart: null,
  speakerLevelNow: null,
  firstTake: null,
  bestTake: null,
  recentScore: null,
  recentCount: 0,
};

// How many of the latest takes make "where you are now".
export const RECENT_TAKES = 5;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// "3 days", "5 weeks", "4 months", "1 year and 2 months".
export function spanLabel(days: number): string {
  if (days < 14) return plural(Math.max(days, 1), "day");
  if (days < 60) return plural(Math.round(days / 7), "week");
  if (days < 365) return plural(Math.round(days / 30), "month");
  const years = Math.floor(days / 365);
  const months = Math.round((days - years * 365) / 30);
  return months > 0 ? `${plural(years, "year")} and ${plural(months, "month")}` : plural(years, "year");
}

export function daysSince(startedOn: string | null, today: Date = new Date()): number | null {
  return startedOn ? Math.max(0, daysBetween(dateFromISODate(startedOn), today)) : null;
}

// Skills that went up at least one stage, the biggest jump first.
export function skillsThatGrew(facts: JourneyFacts): JourneySkill[] {
  return facts.skills
    .filter((s) => s.nowStage > s.startStage)
    .sort((a, b) => b.nowStage - b.startStage - (a.nowStage - a.startStage) || b.nowRating - b.startRating - (a.nowRating - a.startRating));
}

// The skill whose rating moved up the most, for a line of its own.
export function biggestMover(facts: JourneyFacts): JourneySkill | null {
  const moved = facts.skills.filter((s) => s.nowRating - s.startRating > 0);
  return moved.sort((a, b) => b.nowRating - b.startRating - (a.nowRating - a.startRating))[0] ?? null;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// The one-paragraph version, in plain numbers: "You started 3 months ago.
// Since then you've recorded 41 takes and ..." Leaves out whatever is zero,
// and says nothing at all when there is nothing to say.
export function describeJourney(facts: JourneyFacts, today: Date = new Date()): string | null {
  const days = daysSince(facts.startedOn, today);
  const did: string[] = [];
  if (facts.takes > 0) did.push(`recorded ${plural(facts.takes, "take")}`);
  if (facts.drills > 0) did.push(`done ${plural(facts.drills, "drill")}`);
  if (facts.practiceDays > 1) did.push(`practiced on ${plural(facts.practiceDays, "day")}`);
  if (days == null && did.length === 0) return null;
  const start = days != null ? `You started ${spanLabel(days)} ago.` : "";
  const since = did.length ? ` Since then you've ${joinList(did)}.` : "";
  const streak = facts.longestStreak >= 3 ? ` Your longest streak was ${plural(facts.longestStreak, "day")}.` : "";
  return (start + since + streak).trim();
}

export interface ScoreStory {
  first: number;
  now: number;
  change: number;
  // How many takes "now" averages.
  over: number;
}

// The first scored take against the latest few, when there are enough to
// compare (the first take can't be its own "now").
export function scoreStory(facts: JourneyFacts): ScoreStory | null {
  const first = facts.firstTake?.score;
  if (first == null || facts.recentScore == null || facts.recentCount < 2) return null;
  const change = Math.round((facts.recentScore - first) * 10) / 10;
  return { first, now: facts.recentScore, change, over: facts.recentCount };
}

// Folds a list of takes (oldest first, with their measured overall) into the
// take-shaped facts. Pure so it can be tested without a database.
export function takeFacts(
  takes: { sessionId: string; date: string; score: number | null }[],
): Pick<JourneyFacts, "firstTake" | "bestTake" | "recentScore" | "recentCount"> {
  if (takes.length === 0) return { firstTake: null, bestTake: null, recentScore: null, recentCount: 0 };
  const scored = takes.filter((t) => t.score != null);
  const best = scored.reduce<(typeof scored)[number] | null>((top, t) => (top == null || t.score! > top.score! ? t : top), null);
  // The first take is the first one that was scored, so it can be compared.
  const first = scored[0] ?? takes[0];
  const recent = scored.slice(-RECENT_TAKES);
  const recentScore = recent.length ? Math.round((recent.reduce((sum, t) => sum + t.score!, 0) / recent.length) * 10) / 10 : null;
  return {
    firstTake: { sessionId: first.sessionId, date: first.date, score: first.score },
    bestTake: best ? { sessionId: best.sessionId, date: best.date, score: best.score } : null,
    recentScore,
    recentCount: recent.length,
  };
}
