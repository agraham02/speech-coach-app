import { isoDateFromDate } from "../utils/dateUtils";

// The Library's recordings grouped into calendar months (local time), each
// with a summary line: how many takes and the month's average score, plus
// the change from the month before — so progress shows without opening a
// single take.

export interface MonthGroup<T> {
  key: string; // "2026-10"
  title: string; // "October", or "October 2025" outside the current year
  data: T[];
  count: number;
  avgScore: number | null;
  // Which layer the average is of: Tono AI's judged scores when the month has
  // any, else the phone's measured ones. The two are never averaged together
  // (docs/decisions/scoring-taxonomy.md).
  avgLayer: "judged" | "measured" | null;
  // Versus the next older month whose average is of the same layer.
  deltaVsPrevious: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// `sessions` newest first (as the Library loads them); groups come out
// newest first too.
export function groupByMonth<T extends { recordedAt: string; overallScore: number | null; scoreLayer?: "judged" | "measured" | null }>(
  sessions: T[],
  now: Date = new Date(),
): MonthGroup<T>[] {
  const groups: MonthGroup<T>[] = [];
  const byKey = new Map<string, MonthGroup<T>>();
  for (const session of sessions) {
    const date = new Date(session.recordedAt);
    const key = isoDateFromDate(date).slice(0, 7);
    let group = byKey.get(key);
    if (!group) {
      const sameYear = date.getFullYear() === now.getFullYear();
      const title = date.toLocaleDateString("en-US", sameYear ? { month: "long" } : { month: "long", year: "numeric" });
      group = { key, title, data: [], count: 0, avgScore: null, avgLayer: null, deltaVsPrevious: null };
      byKey.set(key, group);
      groups.push(group);
    }
    group.data.push(session);
    group.count += 1;
  }
  groups.sort((a, b) => b.key.localeCompare(a.key));

  for (const group of groups) {
    const scored = group.data.filter((s) => s.overallScore != null);
    const layer = scored.some((s) => s.scoreLayer === "judged") ? "judged" : "measured";
    const scores = scored.filter((s) => (s.scoreLayer === "judged") === (layer === "judged")).map((s) => s.overallScore as number);
    group.avgScore = scores.length ? round1(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    group.avgLayer = scores.length ? layer : null;
  }
  groups.forEach((group, i) => {
    const older = groups.slice(i + 1).find((g) => g.avgScore != null && g.avgLayer === group.avgLayer);
    if (group.avgScore != null && older?.avgScore != null) group.deltaVsPrevious = round1(group.avgScore - older.avgScore);
  });
  return groups;
}
