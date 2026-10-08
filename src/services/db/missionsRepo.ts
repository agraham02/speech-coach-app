import { getDatabase } from "./database";

// One tap per real-world mission done today (Conversation skill).
// Migration v16.

export interface MissionProgress {
  missionId: string;
  count: number;
  completedAt: string | null;
}

export async function getMissionProgress(date: string): Promise<Record<string, MissionProgress>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ mission_id: string; count: number; completed_at: string | null }>(
    `SELECT mission_id, count, completed_at FROM mission_log WHERE date = ?`,
    [date],
  );
  return Object.fromEntries(rows.map((r) => [r.mission_id, { missionId: r.mission_id, count: r.count, completedAt: r.completed_at }]));
}

// Adds one to a mission (capped at its target); completing it stamps the time.
export async function logMission(date: string, missionId: string, target: number): Promise<MissionProgress> {
  const db = await getDatabase();
  const existing = (await getMissionProgress(date))[missionId];
  const count = Math.min(target, (existing?.count ?? 0) + 1);
  const completedAt = count >= target ? existing?.completedAt ?? new Date().toISOString() : null;
  await db.runAsync(
    `INSERT INTO mission_log (date, mission_id, count, completed_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(date, mission_id) DO UPDATE SET count = excluded.count, completed_at = excluded.completed_at`,
    [date, missionId, count, completedAt],
  );
  return { missionId, count, completedAt };
}

// Undo a mistaken tap.
export async function resetMission(date: string, missionId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM mission_log WHERE date = ? AND mission_id = ?`, [date, missionId]);
}

export async function getMissionDaysCompleted(limit = 60): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(DISTINCT date) AS n FROM (SELECT date FROM mission_log WHERE completed_at IS NOT NULL ORDER BY date DESC LIMIT ?)`,
    [limit],
  );
  return row?.n ?? 0;
}
