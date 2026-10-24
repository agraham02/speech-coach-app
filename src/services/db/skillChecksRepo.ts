import { getDatabase } from "./database";
import { generateId } from "../../utils/generateId";
import type { SkillCheckInput, SkillCheckResult } from "../../domain/skillCheck";

// Onboarding skill checks (and the 30-day retake), and the monthly
// speaking-comfort check-in.

export interface SkillCheckPieces {
  read?: { accuracyPercent: number | null; wpm: number | null } | null;
  category?: { count: number; target: number } | null;
  reply?: { latencyMs: number | null; asked: boolean | null } | null;
  talkSessionId?: string | null;
}

export interface StoredSkillCheck {
  id: string;
  takenAt: string;
  topicId: string | null;
  sessionId: string | null;
  pieces: SkillCheckPieces;
  input: SkillCheckInput | null;
  results: SkillCheckResult | null;
  felt: number | null;
  retakeOf: string | null;
}

interface Row {
  id: string;
  taken_at: string;
  topic_id: string | null;
  session_id: string | null;
  pieces_json: string;
  results_json: string | null;
  felt: number | null;
  retake_of: string | null;
}

function fromRow(r: Row): StoredSkillCheck {
  const parsed = r.results_json ? (JSON.parse(r.results_json) as { input: SkillCheckInput; results: SkillCheckResult }) : null;
  return {
    id: r.id,
    takenAt: r.taken_at,
    topicId: r.topic_id,
    sessionId: r.session_id,
    pieces: JSON.parse(r.pieces_json || "{}"),
    input: parsed?.input ?? null,
    results: parsed?.results ?? null,
    felt: r.felt,
    retakeOf: r.retake_of,
  };
}

export async function saveSkillCheck(input: {
  topicId: string | null;
  sessionId: string | null;
  pieces: SkillCheckPieces;
  felt: number | null;
  retakeOf: string | null;
}): Promise<string> {
  const db = await getDatabase();
  const id = generateId();
  await db.runAsync(
    `INSERT INTO skill_checks (id, taken_at, topic_id, session_id, pieces_json, felt, retake_of) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, new Date().toISOString(), input.topicId, input.sessionId, JSON.stringify(input.pieces), input.felt, input.retakeOf],
  );
  return id;
}

export async function setSkillCheckResults(id: string, input: SkillCheckInput, results: SkillCheckResult): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE skill_checks SET results_json = ? WHERE id = ?`, [JSON.stringify({ input, results }), id]);
}

export async function getSkillCheck(id: string): Promise<StoredSkillCheck | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Row>(`SELECT * FROM skill_checks WHERE id = ?`, [id]);
  return row ? fromRow(row) : null;
}

// The first (not a retake) skill check, newest, if there is one: while
// onboarding is unfinished it means the starting point was being put together
// when the app was closed.
export async function getFirstSkillCheckId(): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: string }>(`SELECT id FROM skill_checks WHERE retake_of IS NULL ORDER BY taken_at DESC LIMIT 1`);
  return row?.id ?? null;
}

// Most recent first.
export async function listSkillChecks(): Promise<StoredSkillCheck[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Row>(`SELECT * FROM skill_checks ORDER BY taken_at DESC`);
  return rows.map(fromRow);
}

export async function saveConfidenceCheckin(date: string, rating: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`INSERT OR REPLACE INTO confidence_checkins (date, rating) VALUES (?, ?)`, [date, rating]);
}

export async function listConfidenceCheckins(): Promise<{ date: string; rating: number }[]> {
  const db = await getDatabase();
  return db.getAllAsync<{ date: string; rating: number }>(`SELECT date, rating FROM confidence_checkins ORDER BY date ASC`);
}

// The latest attempt's stored measurements for a drill — how the skill
// check reads back what a drill screen measured.
export async function getLatestDrillMetrics(drillType: string, since: string): Promise<{ accuracy: number | null; wpm: number | null; metrics: unknown } | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ accuracy_percent: number | null; wpm: number | null; metrics_json: string | null }>(
    `SELECT accuracy_percent, wpm, metrics_json FROM drill_attempts WHERE drill_type = ? AND started_at >= ? ORDER BY started_at DESC LIMIT 1`,
    [drillType, since],
  );
  if (!row) return null;
  let metrics: unknown = null;
  try {
    metrics = row.metrics_json ? JSON.parse(row.metrics_json) : null;
  } catch {
    metrics = null;
  }
  return { accuracy: row.accuracy_percent, wpm: row.wpm, metrics };
}
