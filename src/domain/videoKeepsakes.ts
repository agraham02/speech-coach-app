import { isoDateFromDate } from "../utils/dateUtils";
import type { SessionType } from "./sessionTypes";

// Clearing old videos keeps up to two per calendar month — "progress
// keepsakes": the best take and the toughest one (the lowest scored), so you
// can set where you are now against where you started and see how far you've
// come. Keepsakes are compressed (see services/data/videoKeepsakes.ts); a
// take you pin by hand counts as one of that month's keepsakes.

export interface VideoCandidate {
  id: string;
  recordedAt: string; // ISO datetime (UTC)
  sessionType: SessionType;
  durationSeconds: number;
  score: number | null; // 0-10, the session score when there is one
  keepsake: boolean;
}

export interface CleanupPlan {
  // Newly chosen keepsakes (already-pinned ones aren't repeated here).
  keep: string[];
  delete: string[];
}

function localMonth(iso: string): string {
  return isoDateFromDate(new Date(iso)).slice(0, 7);
}

// Best representative of a month: a spoken rep (not script reading), then
// the highest score, then the longest take, then the most recent.
function rank(a: VideoCandidate, b: VideoCandidate): number {
  const script = (c: VideoCandidate) => (c.sessionType === "script_practice" ? 1 : 0);
  if (script(a) !== script(b)) return script(a) - script(b);
  if ((a.score ?? -1) !== (b.score ?? -1)) return (b.score ?? -1) - (a.score ?? -1);
  if (a.durationSeconds !== b.durationSeconds) return b.durationSeconds - a.durationSeconds;
  return b.recordedAt.localeCompare(a.recordedAt);
}

// `videos`: every session whose video still exists. Videos recorded before
// `cutoffIso` are deleted unless they're a keepsake. A month with no
// keepsake gets its best take; a month with fewer than two also gets its
// toughest — the lowest scored spoken rep, and only when it scored below the
// month's best (one take, or takes that scored the same, make no "before and
// after"). A pick may be a newer video from the same month (it's simply kept,
// not deleted), and a month never keeps more than two.
export function planVideoCleanup(videos: VideoCandidate[], cutoffIso: string): CleanupPlan {
  const byMonth = new Map<string, VideoCandidate[]>();
  for (const v of videos) {
    const month = localMonth(v.recordedAt);
    byMonth.set(month, [...(byMonth.get(month) ?? []), v]);
  }

  const keep: string[] = [];
  const del: string[] = [];
  for (const monthVideos of byMonth.values()) {
    const expiring = monthVideos.filter((v) => v.recordedAt < cutoffIso && !v.keepsake);
    if (!expiring.length) continue;
    const kept = new Set(monthVideos.filter((v) => v.keepsake).map((v) => v.id));
    // Feeling of the Week takes are private: never picked automatically.
    const eligible = monthVideos.filter((v) => v.sessionType !== "feeling");
    if (!kept.size && eligible.length) {
      const best = [...eligible].sort(rank)[0];
      keep.push(best.id);
      kept.add(best.id);
    }
    if (kept.size < 2) {
      const scored = eligible.filter((v) => v.score !== null && v.sessionType !== "script_practice");
      const top = scored.reduce((max, v) => Math.max(max, v.score!), -Infinity);
      const toughest = scored.filter((v) => !kept.has(v.id)).sort((a, b) => a.score! - b.score! || a.durationSeconds - b.durationSeconds)[0];
      if (toughest && toughest.score! < top) {
        keep.push(toughest.id);
        kept.add(toughest.id);
      }
    }
    for (const v of expiring) if (!kept.has(v.id)) del.push(v.id);
  }
  return { keep, delete: del };
}
