import { Platform } from "react-native";
import { getDatabase } from "../db/database";
import { computePresenceMetrics, type PresenceSample } from "../../domain/presenceMetrics";
import { getGazeYFixed, setGazeYFixed } from "../prefs/prefsStore";
import { logger } from "../../utils/logger";

// iOS takes recorded before the fix stored the vertical gaze upside down, so
// glances up counted as looking down. Flips every stored timeline once and
// rebuilds its presence summary; the score rescore that follows (the score
// version was bumped with this) then uses the corrected numbers.
export function flipGazeY(timeline: PresenceSample[]): PresenceSample[] {
  return timeline.map((s) => (s.gazeY === undefined ? s : { ...s, gazeY: 0 - s.gazeY || 0 }));
}

export async function repairStoredGazeY(): Promise<void> {
  if (Platform.OS !== "ios" || getGazeYFixed()) return;
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ session_id: string; json: string }>(`SELECT session_id, json FROM session_artifacts WHERE kind = 'presence_timeline'`);
    const now = new Date().toISOString();
    let flipped = 0;
    await db.withTransactionAsync(async () => {
      for (const row of rows) {
        let timeline: PresenceSample[];
        try {
          timeline = JSON.parse(row.json) as PresenceSample[];
        } catch {
          continue;
        }
        if (!Array.isArray(timeline) || !timeline.some((s) => s.gazeY !== undefined)) continue;
        const fixed = flipGazeY(timeline);
        await db.runAsync(`UPDATE session_artifacts SET json = ? WHERE session_id = ? AND kind = 'presence_timeline'`, [JSON.stringify(fixed), row.session_id]);
        const metrics = computePresenceMetrics(fixed);
        if (metrics) {
          await db.runAsync(`INSERT OR REPLACE INTO session_artifacts (session_id, kind, version, json, created_at) VALUES (?, 'presence', 1, ?, ?)`, [row.session_id, JSON.stringify(metrics), now]);
        }
        flipped += 1;
      }
    });
    setGazeYFixed(true);
    if (flipped) logger.info(`[face] flipped the vertical gaze in ${flipped} stored timeline(s)`);
  } catch (error) {
    logger.error(`[face] gaze repair failed — ${(error as Error).message}`);
  }
}
