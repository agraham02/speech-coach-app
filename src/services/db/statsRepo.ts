import { getDatabase } from "./database";
import { parseAnnotationsJson } from "./mappers";
import type { Archetype } from "../../domain/sessionTypes";
import type { ScoredSessionSummary } from "../../domain/trends";

interface ScoredSessionRow {
  recorded_at: string;
  duration_seconds: number;
  overall_score: number;
  structure_score: number;
  content_coherence_score: number;
  rate_score: number;
  volume_score: number;
  pitch_melody_score: number;
  tonality_score: number;
  pausing_score: number;
  archetype_detected: string;
  annotations_json: string;
}

function toSummary(row: ScoredSessionRow): ScoredSessionSummary {
  const deliveryAvgScore =
    Math.round(
      ((row.rate_score + row.volume_score + row.pitch_melody_score + row.tonality_score + row.pausing_score) / 5) * 10,
    ) / 10;

  const restatedPointCount = parseAnnotationsJson(row.annotations_json).filter(
    (a) => a.category === "restated_point",
  ).length;
  const minutes = Math.max(row.duration_seconds / 60, 1 / 60);
  const restatedPointRatePerMinute = Math.round((restatedPointCount / minutes) * 10) / 10;

  return {
    recordedAt: row.recorded_at,
    overallScore: row.overall_score,
    structureScore: row.structure_score,
    deliveryAvgScore,
    archetype: row.archetype_detected as Archetype,
    coherenceScore: row.content_coherence_score,
    restatedPointCount,
    restatedPointRatePerMinute,
  };
}

// All graded, non-deleted impromptu sessions, oldest first — used for trend
// math. Script readings are excluded: their structure/content scores are a
// fixed 7 and would skew the averages.
export async function getScoredSessionSummaries(): Promise<ScoredSessionSummary[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ScoredSessionRow>(
    `SELECT s.recorded_at, s.duration_seconds, sc.overall_score, sc.structure_score, sc.content_coherence_score,
            sc.rate_score, sc.volume_score, sc.pitch_melody_score, sc.tonality_score, sc.pausing_score,
            sc.archetype_detected, sc.annotations_json
     FROM sessions s
     JOIN scores sc ON sc.session_id = s.id
     WHERE s.status = 'done' AND s.deleted_at IS NULL AND s.session_type != 'script_practice'
     ORDER BY s.recorded_at ASC`,
  );
  return rows.map(toSummary);
}

// Every completed session's date, regardless of whether it has scores — used
// for streaks, since practicing (not grading) is what a streak measures.
export async function getCompletedSessionDates(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ recorded_at: string }>(
    `SELECT recorded_at FROM sessions WHERE status = 'done' AND deleted_at IS NULL ORDER BY recorded_at ASC`,
  );
  return rows.map((row) => row.recorded_at);
}

export interface SessionMetricPoint {
  recordedAt: string;
  wpm: number | null;
  fillerRate: number | null;
  eyeContact: number | null;
}

// On-device measurements per finished impromptu session, oldest first —
// the Progress charts. Uses SQLite's JSON functions so the full word list
// never has to be loaded into JS.
export async function getSessionMetricSeries(limit = 30): Promise<SessionMetricPoint[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    recorded_at: string;
    duration_seconds: number;
    word_count: number | null;
    filler_rate_per_minute: number | null;
    eye_contact: number | null;
  }>(
    `SELECT * FROM (
       SELECT s.recorded_at, s.duration_seconds, s.filler_rate_per_minute,
              json_array_length(s.transcript_words_json) AS word_count,
              json_extract(a.json, '$.eyeContactPercent') AS eye_contact
       FROM sessions s
       LEFT JOIN session_artifacts a ON a.session_id = s.id AND a.kind = 'presence'
       WHERE s.status = 'done' AND s.deleted_at IS NULL AND s.session_type IN ('spontaneous', 'concise', 'free_record')
       ORDER BY s.recorded_at DESC LIMIT ?
     ) ORDER BY recorded_at ASC`,
    [limit],
  );
  return rows.map((r) => ({
    recordedAt: r.recorded_at,
    wpm: r.word_count && r.duration_seconds > 0 ? Math.round(r.word_count / (r.duration_seconds / 60)) : null,
    fillerRate: r.filler_rate_per_minute,
    eyeContact: r.eye_contact,
  }));
}
