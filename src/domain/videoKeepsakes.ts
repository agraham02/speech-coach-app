import { isoDateFromDate } from "../utils/dateUtils";
import type { SessionType } from "./sessionTypes";

// Clearing old videos keeps one per calendar month — a "progress keepsake" —
// so there's always something to rewatch from each stage of practice.
// Keepsakes are compressed (see services/data/videoKeepsakes.ts); a take you
// pin by hand counts as that month's keepsake.

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
// `cutoffIso` are deleted unless they're a keepsake. A month gets a new
// keepsake only if it has none yet; the pick may be a newer video from the
// same month (it's simply kept, not deleted), so a month is never
// represented twice.
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
    for (const v of expiring) if (!kept.has(v.id)) del.push(v.id);
  }
  return { keep, delete: del };
}
