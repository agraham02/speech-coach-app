import { getAllSessions } from "../db/sessionsRepo";
import { getArtifact } from "../db/artifactsRepo";
import { computePresenceMetrics, DEFAULT_PRESENCE_THRESHOLDS, type PresenceMetrics, type PresenceSample, type PresenceThresholds } from "../../domain/presenceMetrics";

export interface RescoreRow {
  sessionId: string;
  recordedAt: string;
  defaults: PresenceMetrics;
  tuned: PresenceMetrics;
}

// Recomputes presence metrics for the latest takes that kept a face
// timeline, at the shipped defaults and at the thresholds being tried. Read
// only: nothing is written back to the takes.
export async function rescoreRecent(tuned: PresenceThresholds, wanted = 10, scan = 60): Promise<RescoreRow[]> {
  const rows: RescoreRow[] = [];
  const sessions = (await getAllSessions()).slice(0, scan);
  for (const session of sessions) {
    if (rows.length >= wanted) break;
    const timeline = await getArtifact<PresenceSample[]>(session.id, "presence_timeline");
    if (!timeline) continue;
    const defaults = computePresenceMetrics(timeline, DEFAULT_PRESENCE_THRESHOLDS);
    const mine = computePresenceMetrics(timeline, tuned);
    if (defaults && mine) rows.push({ sessionId: session.id, recordedAt: session.recordedAt, defaults, tuned: mine });
  }
  return rows;
}
