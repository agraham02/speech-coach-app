import { getDatabase } from "./database";
import { rowToDrillCompletion, type DrillCompletionRow } from "./mappers";
import { generateId } from "../../utils/generateId";
import type { DifficultyTier, DrillCompletion } from "../../domain/sessionTypes";

export interface NewDrillCompletion {
  twisterId: string;
  accuracyPercent: number;
  wpm: number;
  difficulty: DifficultyTier;
}

export async function insertDrillCompletion(input: NewDrillCompletion): Promise<DrillCompletion> {
  const db = await getDatabase();
  const id = generateId();
  const completedAt = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO drill_completions (id, twister_id, completed_at, accuracy_percent, wpm, difficulty)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, input.twisterId, completedAt, input.accuracyPercent, input.wpm, input.difficulty],
  );
  return { id, twisterId: input.twisterId, completedAt, accuracyPercent: input.accuracyPercent, wpm: input.wpm, difficulty: input.difficulty };
}

export async function getRecentDrillCompletions(limit = 50): Promise<DrillCompletion[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<DrillCompletionRow>(
    "SELECT * FROM drill_completions ORDER BY completed_at DESC LIMIT ?",
    [limit],
  );
  return rows.map(rowToDrillCompletion);
}

// Shape matches exactly what `computeStreaks()` (src/domain/streaks.ts)
// already expects — any-order array of date strings, one per practiced day
// — so the existing generic streak logic plugs in with zero changes to that
// module (same pattern as statsRepo.ts's getCompletedSessionDates()).
export async function getDrillCompletionDates(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ completed_at: string }>(
    "SELECT completed_at FROM drill_completions ORDER BY completed_at ASC",
  );
  return rows.map((row) => row.completed_at);
}
