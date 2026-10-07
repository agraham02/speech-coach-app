import { getDatabase } from "./database";
import { rowToDrillCompletion, type DrillCompletionRow } from "./mappers";
import { generateId } from "../../utils/generateId";
import type { DifficultyTier, DrillCompletion } from "../../domain/sessionTypes";

export interface NewDrillCompletion {
  twisterId: string;
  // null for manual-timer attempts — there was nothing to compare against.
  accuracyPercent: number | null;
  wpm: number;
  difficulty: DifficultyTier;
  cleanWordPercent?: number | null;
  metrics?: unknown;
}

// Writes to the generalized drill_attempts table (migration v14). The
// legacy drill_completions table is kept read-only for history.
export async function insertDrillCompletion(input: NewDrillCompletion): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO drill_attempts (id, drill_type, content_id, difficulty, started_at, mode, accuracy_percent, clean_word_percent, wpm, metrics_json)
     VALUES (?, 'twister', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      generateId(),
      input.twisterId,
      input.difficulty,
      new Date().toISOString(),
      input.accuracyPercent === null ? "manual" : "live",
      input.accuracyPercent,
      input.cleanWordPercent ?? null,
      input.wpm,
      input.metrics === undefined ? null : JSON.stringify(input.metrics),
    ],
  );
}

// Live (scored) twister attempts only — manual-timer attempts have no
// accuracy and must not count as 0% in the curriculum's drill score.
export async function getRecentDrillCompletions(limit = 50): Promise<DrillCompletion[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<DrillCompletionRow>(
    `SELECT id, content_id AS twister_id, started_at AS completed_at, accuracy_percent, wpm, difficulty
     FROM drill_attempts
     WHERE drill_type = 'twister' AND accuracy_percent IS NOT NULL
     ORDER BY started_at DESC LIMIT ?`,
    [limit],
  );
  return rows.map(rowToDrillCompletion);
}

// Shape matches exactly what `computeStreaks()` (src/domain/streaks.ts)
// already expects — any-order array of date strings, one per practiced day.
// Every attempt counts toward the streak, scored or not.
export async function getDrillCompletionDates(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ started_at: string }>(
    "SELECT started_at FROM drill_attempts ORDER BY started_at ASC",
  );
  return rows.map((row) => row.started_at);
}
