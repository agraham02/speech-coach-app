import { getDatabase } from "./database";
import { logger } from "../../utils/logger";

// JSON outputs of analysis steps that don't deserve their own columns
// (pause lists, presence timelines, coach output, the deep review's own
// transcript). Keyed by (session, kind); writing replaces.
export type ArtifactKind =
  | "cloud_transcript"
  | "pauses"
  | "presence_timeline"
  | "presence"
  | "coach"
  // The Tono AI review's own coaching, kept apart so a re-run of the phone's
  // coach step can lay it back over the rules (coachStep.ts).
  | "cloud_coach"
  | "progress"
  | "felt_observed"
  | "session_score"
  | "cloud_usage"
  // What each kind of analysis did on this take, with its provenance
  // (services/analysis/store.ts).
  | "analysis";

export async function putArtifact(sessionId: string, kind: ArtifactKind, value: unknown, version = 1): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO session_artifacts (session_id, kind, version, json, created_at) VALUES (?, ?, ?, ?, ?)`,
    [sessionId, kind, version, JSON.stringify(value), new Date().toISOString()],
  );
}

// The stored JSON of one kind across every session (oldest first), for
// totals like deep review usage. A deleted take's artifacts don't count.
export async function listArtifactsOfKind<T>(kind: ArtifactKind): Promise<T[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ json: string }>(`SELECT a.json FROM session_artifacts a JOIN sessions s ON s.id = a.session_id WHERE a.kind = ? AND s.deleted_at IS NULL ORDER BY a.created_at`, [kind]);
  const out: T[] = [];
  for (const row of rows) {
    try {
      out.push(JSON.parse(row.json) as T);
    } catch {
      // Skip a malformed row.
    }
  }
  return out;
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

export interface ArtifactInfo {
  kind: ArtifactKind;
  version: number;
  bytes: number;
  createdAt: string;
}

// What a session has stored, without loading the JSON (for the Dev tab).
export async function listArtifacts(sessionId: string): Promise<ArtifactInfo[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ kind: string; version: number; bytes: number; created_at: string }>(
    `SELECT kind, version, LENGTH(json) AS bytes, created_at FROM session_artifacts WHERE session_id = ? ORDER BY kind`,
    [sessionId],
  );
  return rows.map((r) => ({ kind: r.kind as ArtifactKind, version: r.version, bytes: r.bytes, createdAt: r.created_at }));
}
