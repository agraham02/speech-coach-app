import { getDatabase } from "../db/database";
import { deleteArtifact, listSessionIdsWithArtifact, putArtifact } from "../db/artifactsRepo";
import { getStepsForSessions } from "../db/stepsRepo";
import { getSessionById } from "../db/sessionsRepo";
import { getTakeAnalyses } from "../analysis/store";
import { describeSessionSubject } from "../sessions/sessionSubject";
import { summarizeWork, type WorkSummary } from "../../domain/analysis/progress";
import type { Session } from "../../domain/sessionTypes";

// Which takes the app is working on, or has finished and the person hasn't
// opened yet: what Today shows so a take doesn't have to be watched. The
// database is the source of truth (steps, and a "ready_unseen" marker that
// outlives the app being closed); screens refresh on step events and on the
// marker changing.

export type ActiveKind = "working" | "ready" | "stuck";

export interface ActiveTake {
  session: Session;
  title: string;
  kind: ActiveKind;
  work: WorkSummary;
}

// A take that failed or was cut off stays on Today for a day.
const STUCK_WINDOW_MS = 24 * 60 * 60 * 1000;

type Listener = () => void;
const listeners = new Set<Listener>();
const changed = () => listeners.forEach((l) => l());

// Hears the "ready, not opened yet" list change.
export function subscribeToReadyMarkers(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// A take finished while its result wasn't on screen.
export async function markReadyUnseen(sessionId: string): Promise<void> {
  await putArtifact(sessionId, "ready_unseen", { at: new Date().toISOString() });
  changed();
}

// The Result screen opened.
export async function markResultSeen(sessionId: string): Promise<void> {
  await deleteArtifact(sessionId, "ready_unseen");
  changed();
}

export async function loadActiveTakes(limit = 4): Promise<ActiveTake[]> {
  const db = await getDatabase();
  const since = new Date(Date.now() - STUCK_WINDOW_MS).toISOString();
  // By the steps, which are written before anyone is told (the session's
  // own status is derived a moment later).
  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT s.id FROM sessions s WHERE s.deleted_at IS NULL AND s.recorded_at > ?
       AND EXISTS (SELECT 1 FROM session_steps t WHERE t.session_id = s.id AND t.status IN ('pending', 'running', 'failed', 'interrupted'))
     ORDER BY s.recorded_at DESC`,
    [since],
  );
  const unseen = await listSessionIdsWithArtifact("ready_unseen");
  const ids = [...new Set([...rows.map((r) => r.id), ...unseen])].slice(0, limit);
  const steps = await getStepsForSessions(ids);
  const out: ActiveTake[] = [];
  for (const id of ids) {
    const session = await getSessionById(id);
    if (!session) continue;
    const work = summarizeWork(steps.get(id) ?? [], (await getTakeAnalyses(id)).take_review);
    const kind: ActiveKind = work.phase === "running" || work.phase === "queued" ? "working" : work.phase === "attention" ? "stuck" : unseen.includes(id) ? "ready" : "stuck";
    if (kind === "stuck" && work.phase !== "attention") continue;
    out.push({ session, title: (await describeSessionSubject(session)).title, kind, work });
  }
  // Working first, then stuck, then ready: what is happening now leads.
  const rank: Record<ActiveKind, number> = { working: 0, stuck: 1, ready: 2 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
}
