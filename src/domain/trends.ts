import { dateFromISODate, daysBetween } from "../utils/dateUtils";
import type { SkillId } from "../theme/tokens";
import type { Layer } from "./scoring/taxonomy";
import type { TakeScores } from "./scoring/takeScore";

// Score trends, from the take score sheets (domain/scoring/takeScore.ts).
// The two layers are never put on one line or averaged together: the measured
// score is on every take, the judged one only on takes Tono AI judged, so a
// judged take adds a point to the judged line and the measured line still has
// one for it. A take without a judgement is a gap in the judged line, never a
// zero. Pure.

export interface LayerNumbers {
  overall: number;
  bySkill: Partial<Record<SkillId, number>>;
}

export interface ScorePoint {
  recordedAt: string; // ISO datetime
  measured: LayerNumbers | null;
  judged: LayerNumbers | null;
}

export const TREND_SKILLS: SkillId[] = ["cadence", "impromptu", "confidence"];

function numbersOf(sheet: TakeScores["measured"]): LayerNumbers | null {
  if (!sheet) return null;
  const bySkill: Partial<Record<SkillId, number>> = {};
  for (const c of sheet.categories) bySkill[c.skill] = c.score;
  return { overall: sheet.overall, bySkill };
}

export function scorePointOf(recordedAt: string, scores: TakeScores): ScorePoint {
  return { recordedAt, measured: numbersOf(scores.measured), judged: numbersOf(scores.judged) };
}

export interface WeekStats {
  sessionCount: number;
  overall: number | null;
  bySkill: Partial<Record<SkillId, number | null>>;
}

function average(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((sum, n) => sum + n, 0) / nums.length) * 10) / 10;
}

// daysAgoRange is [inclusive, exclusive): [0, 7) is the last 7 days including
// today, [7, 14) the 7 days before that.
function statsForWindow(points: ScorePoint[], layer: Layer, today: Date, daysAgoRange: [number, number]): WeekStats {
  const [startInclusive, endExclusive] = daysAgoRange;
  const inWindow = points.filter((p) => {
    const daysAgo = daysBetween(dateFromISODate(p.recordedAt), today);
    return daysAgo >= startInclusive && daysAgo < endExclusive && p[layer] != null;
  });
  const numbers = inWindow.map((p) => p[layer]!);
  const bySkill: WeekStats["bySkill"] = {};
  for (const skill of TREND_SKILLS) bySkill[skill] = average(numbers.map((n) => n.bySkill[skill]).filter((v): v is number => v != null));
  return { sessionCount: inWindow.length, overall: average(numbers.map((n) => n.overall)), bySkill };
}

export interface WeeklyComparison {
  thisWeek: WeekStats;
  lastWeek: WeekStats;
}

// One layer's week against the week before, using only the takes that have
// that layer.
export function computeThisWeekVsLastWeek(points: ScorePoint[], layer: Layer, today: Date = new Date()): WeeklyComparison {
  return {
    thisWeek: statsForWindow(points, layer, today, [0, 7]),
    lastWeek: statsForWindow(points, layer, today, [7, 14]),
  };
}

export function hasLayer(points: ScorePoint[], layer: Layer): boolean {
  return points.some((p) => p[layer] != null);
}
