import { getDatabase } from "./database";
import type { Archetype } from "../../domain/sessionTypes";
import type { ScoredSessionSummary } from "../../domain/trends";

interface ScoredSessionRow {
  recorded_at: string;
  overall_score: number;
  structure_score: number;
  rate_score: number;
  volume_score: number;
  pitch_melody_score: number;
  tonality_score: number;
  pausing_score: number;
  archetype_detected: string;
}

function toSummary(row: ScoredSessionRow): ScoredSessionSummary {
  const deliveryAvgScore =
    Math.round(
      ((row.rate_score + row.volume_score + row.pitch_melody_score + row.tonality_score + row.pausing_score) / 5) * 10,
    ) / 10;

  return {
    recordedAt: row.recorded_at,
    overallScore: row.overall_score,
    structureScore: row.structure_score,
    deliveryAvgScore,
    archetype: row.archetype_detected as Archetype,
  };
}

// All graded sessions (done + has a scores row), oldest first — used for trend/synthesis math.
export async function getScoredSessionSummaries(): Promise<ScoredSessionSummary[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ScoredSessionRow>(
    `SELECT s.recorded_at, sc.overall_score, sc.structure_score, sc.rate_score, sc.volume_score,
            sc.pitch_melody_score, sc.tonality_score, sc.pausing_score, sc.archetype_detected
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
