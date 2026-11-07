import { dateFromISODate, daysBetween } from "../utils/dateUtils";
import type { PillarId } from "./scoring/skillTree";
import type { TakeScores } from "./scoring/takeScore";

// Score trends, from the take sheets (domain/scoring/takeScore.ts): a Delivery
// line for everyone, a Message line for judged takes (plan 6.3). A take without a
// judgement is a gap in the Message line, never a zero. Pure.

export type TrendLine = "delivery" | "message";

export interface ScorePoint {
  recordedAt: string; // ISO datetime
  delivery: number | null;
  message: number | null;
  byPillar: Partial<Record<PillarId, number>>;
}

export const TREND_PILLARS: PillarId[] = ["voice", "clarity", "presence"];

export function scorePointOf(recordedAt: string, scores: TakeScores): ScorePoint {
  const byPillar: ScorePoint["byPillar"] = {};
  for (const p of scores.pillars) if (p.score != null) byPillar[p.id] = p.score;
  return { recordedAt, delivery: scores.delivery, message: scores.message, byPillar };
}

export interface WeekStats {
  sessionCount: number;
  score: number | null;
  byPillar: Partial<Record<PillarId, number | null>>;
}

function average(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((sum, n) => sum + n, 0) / nums.length);
}

// daysAgoRange is [inclusive, exclusive): [0, 7) is the last 7 days including
// today, [7, 14) the 7 days before that.
function statsForWindow(points: ScorePoint[], line: TrendLine, today: Date, daysAgoRange: [number, number]): WeekStats {
  const [startInclusive, endExclusive] = daysAgoRange;
  const inWindow = points.filter((p) => {
    const daysAgo = daysBetween(dateFromISODate(p.recordedAt), today);
    return daysAgo >= startInclusive && daysAgo < endExclusive && p[line] != null;
  });
  const byPillar: WeekStats["byPillar"] = {};
  if (line === "delivery") for (const pillar of TREND_PILLARS) byPillar[pillar] = average(inWindow.map((p) => p.byPillar[pillar]).filter((v): v is number => v != null));
  return { sessionCount: inWindow.length, score: average(inWindow.map((p) => p[line]!)), byPillar };
}

export interface WeeklyComparison {
  thisWeek: WeekStats;
  lastWeek: WeekStats;
}

// One line's week against the week before, using only the takes that have it.
export function computeThisWeekVsLastWeek(points: ScorePoint[], line: TrendLine, today: Date = new Date()): WeeklyComparison {
  return {
    thisWeek: statsForWindow(points, line, today, [0, 7]),
    lastWeek: statsForWindow(points, line, today, [7, 14]),
  };
}

export function hasLine(points: ScorePoint[], line: TrendLine): boolean {
  return points.some((p) => p[line] != null);
}
