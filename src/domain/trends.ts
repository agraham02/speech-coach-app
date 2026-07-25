import { dateFromISODate, daysBetween } from "../utils/dateUtils";
import type { Archetype } from "./sessionTypes";

export interface ScoredSessionSummary {
  recordedAt: string; // ISO datetime
  overallScore: number;
  structureScore: number;
  deliveryAvgScore: number;
  archetype: Archetype;
}

export interface WeekStats {
  sessionCount: number;
  avgOverall: number | null;
  avgStructure: number | null;
  avgDelivery: number | null;
  topArchetype: Archetype | null;
}

function average(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((sum, n) => sum + n, 0) / nums.length) * 10) / 10;
}

function mostFrequent<T extends string>(items: T[]): T | null {
  if (items.length === 0) return null;
  const counts = new Map<T, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  let best: T | null = null;
  let bestCount = 0;
  for (const [item, count] of counts) {
    if (count > bestCount) {
      best = item;
      bestCount = count;
    }
  }
  return best;
}

// daysAgoRange is [inclusive, exclusive) — e.g. [0, 7) means "the last 7 days
// including today", [7, 14) means "the 7 days before that".
function statsForWindow(
  sessions: ScoredSessionSummary[],
  today: Date,
  daysAgoRange: [number, number],
): WeekStats {
  const [startInclusive, endExclusive] = daysAgoRange;
  const windowSessions = sessions.filter((s) => {
    const daysAgo = daysBetween(dateFromISODate(s.recordedAt), today);
    return daysAgo >= startInclusive && daysAgo < endExclusive;
  });

  return {
    sessionCount: windowSessions.length,
    avgOverall: average(windowSessions.map((s) => s.overallScore)),
    avgStructure: average(windowSessions.map((s) => s.structureScore)),
    avgDelivery: average(windowSessions.map((s) => s.deliveryAvgScore)),
    topArchetype: mostFrequent(windowSessions.map((s) => s.archetype)),
  };
}

export interface WeeklyComparison {
  thisWeek: WeekStats;
  lastWeek: WeekStats;
}

export function computeThisWeekVsLastWeek(
  sessions: ScoredSessionSummary[],
  today: Date = new Date(),
): WeeklyComparison {
  return {
    thisWeek: statsForWindow(sessions, today, [0, 7]),
    lastWeek: statsForWindow(sessions, today, [7, 14]),
  };
}
