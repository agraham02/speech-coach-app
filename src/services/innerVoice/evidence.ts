import { getDatabase } from "../db/database";
import { listSelfLikes } from "../db/selfLikesRepo";
import { getStreakDates } from "../db/progressRepo";
import { evidenceFor } from "../../domain/innerVoice/evidence";
import { isoDateFromDate } from "../../utils/dateUtils";

interface TurnLike {
  replied?: unknown;
  latencyMs?: unknown;
}

// Facts from your own practice that bear on a worry — conversation replies,
// the days you've practiced, what you wrote in Three things.
export async function loadEvidence(presetId: string | null): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ metrics_json: string | null }>(
    `SELECT metrics_json FROM drill_attempts WHERE skill = 'conversation' AND metrics_json IS NOT NULL ORDER BY started_at DESC LIMIT 60`,
  );
  const turns: { replied: boolean; latencyMs: number | null }[] = [];
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.metrics_json ?? "null") as { turns?: TurnLike[] } | null;
      for (const t of parsed?.turns ?? []) {
        if (typeof t?.replied === "boolean") turns.push({ replied: t.replied, latencyMs: typeof t.latencyMs === "number" ? t.latencyMs : null });
      }
    } catch {
      // An unreadable attempt just adds nothing.
    }
  }
  const [likes, dates] = await Promise.all([listSelfLikes(), getStreakDates()]);
  const days = new Set(dates.map((d) => (d.length > 10 ? isoDateFromDate(new Date(d)) : d.slice(0, 10))));
  return evidenceFor({ presetId, turns, selfLikes: likes.map((l) => l.text).reverse(), practiceDays: days.size });
}
