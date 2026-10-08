import { getDatabase } from "./database";
import { logger } from "../../utils/logger";

// JSON outputs of analysis steps that don't deserve their own columns
// (pause lists, presence timelines, coach output, the deep review's own
// transcript). Keyed by (session, kind); writing replaces.
export type ArtifactKind = "cloud_transcript" | "pauses" | "presence_timeline" | "presence" | "coach" | "progress" | "felt_observed";

export async function putArtifact(sessionId: string, kind: ArtifactKind, value: unknown, version = 1): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO session_artifacts (session_id, kind, version, json, created_at) VALUES (?, ?, ?, ?, ?)`,
    [sessionId, kind, version, JSON.stringify(value), new Date().toISOString()],
  );
}

export async function getArtifact<T>(sessionId: string, kind: ArtifactKind): Promise<T | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ json: string }>(
    `SELECT json FROM session_artifacts WHERE session_id = ? AND kind = ?`,
    [sessionId, kind],
  );
  if (!row) return null;
  try {
    return JSON.parse(row.json) as T;
  } catch (error) {
    logger.warn(`[db] artifact ${kind} for ${sessionId} is malformed — ${(error as Error).message}`);
    return null;
  }
}
