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

// All graded sessions (done + has a scores row), oldest first — used for trend/synthesis math.
export async function getScoredSessionSummaries(): Promise<ScoredSessionSummary[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ScoredSessionRow>(
    `SELECT s.recorded_at, s.duration_seconds, sc.overall_score, sc.structure_score, sc.content_coherence_score,
            sc.rate_score, sc.volume_score, sc.pitch_melody_score, sc.tonality_score, sc.pausing_score,
            sc.archetype_detected, sc.annotations_json
     FROM sessions s
     JOIN scores sc ON sc.session_id = s.id
     WHERE s.status = 'done'
     ORDER BY s.recorded_at ASC`,
  );
  return rows.map(toSummary);
}

// Every completed session's date, regardless of whether it has scores — used
// for streaks, since practicing (not grading) is what a streak measures.
export async function getCompletedSessionDates(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ recorded_at: string }>(
    `SELECT recorded_at FROM sessions WHERE status = 'done' ORDER BY recorded_at ASC`,
  );
  return rows.map((row) => row.recorded_at);
}
