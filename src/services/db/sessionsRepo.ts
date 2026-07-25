import { getDatabase } from "./database";
import { rowToSession, type SessionRow } from "./mappers";
import type { Session, SessionStatus } from "../../domain/sessionTypes";
import { todayISODate } from "../../utils/dateUtils";

export async function insertSession(session: Session): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO sessions
      (id, prompt_id, recorded_at, video_path, duration_seconds, transcription_source, transcript_verbatim, transcript_clean, status, notion_synced_at, wants_grading, wants_notion_sync)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      session.id,
      session.promptId,
      session.recordedAt,
      session.videoPath,
      session.durationSeconds,
      session.transcriptionSource,
      session.transcriptVerbatim,
      session.transcriptClean,
      session.status,
      session.notionSyncedAt,
      session.wantsGrading ? 1 : 0,
      session.wantsNotionSync ? 1 : 0,
    ],
  );
}

export async function updateSessionTranscripts(
  id: string,
  transcriptVerbatim: string,
  transcriptClean: string,
  durationSeconds: number,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE sessions SET transcript_verbatim = ?, transcript_clean = ?, duration_seconds = ? WHERE id = ?`,
    [transcriptVerbatim, transcriptClean, durationSeconds, id],
  );
}

export async function updateSessionStatus(
  id: string,
  status: SessionStatus,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE sessions SET status = ? WHERE id = ?`, [
    status,
    id,
  ]);
}

export async function markSessionNotionSynced(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE sessions SET notion_synced_at = ? WHERE id = ?`, [
    new Date().toISOString(),
    id,
  ]);
}

export async function getSessionById(id: string): Promise<Session | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<SessionRow>(
    `SELECT * FROM sessions WHERE id = ?`,
    [id],
  );
  return row ? rowToSession(row) : null;
}

// Returns the promptIds of the most recently recorded sessions (most recent
// first), deduplicated, for use as a "don't repeat" exclusion set when picking
// the next prompt. Any session counts as "used" regardless of status.
export async function getRecentlyUsedPromptIds(limit: number): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ prompt_id: string }>(
    `SELECT prompt_id FROM sessions GROUP BY prompt_id ORDER BY MAX(recorded_at) DESC LIMIT ?`,
    [limit],
  );
  return rows.map((row) => row.prompt_id);
}

export async function getTodaysSession(): Promise<Session | null> {
  const db = await getDatabase();
  const today = todayISODate();
  const row = await db.getFirstAsync<SessionRow>(
    `SELECT * FROM sessions WHERE recorded_at LIKE ? ORDER BY recorded_at DESC LIMIT 1`,
    [`${today}%`],
  );
  return row ? rowToSession(row) : null;
}

// All sessions, most recent first — used by the History screen.
export async function getAllSessions(): Promise<Session[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SessionRow>(
    `SELECT * FROM sessions ORDER BY recorded_at DESC`,
  );
  return rows.map(rowToSession);
}

// Deletes a session's DB rows (session + any scores). The caller is
// responsible for deleting the associated video file, since that's a
// filesystem concern, not a DB one.
export async function deleteSession(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM scores WHERE session_id = ?`, [id]);
  await db.runAsync(`DELETE FROM sessions WHERE id = ?`, [id]);
}
