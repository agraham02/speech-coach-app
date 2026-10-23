import { getDatabase } from "./database";

// A bare date marker for every day you practiced and later deleted the take
// of. The streak measures showing up, so deleting a take must not break it.
// A marker is only a local date (YYYY-MM-DD): no link to the take, and no
// transcript, score or media. Nothing else about a deleted take survives.

// `date` is a local date. Safe to call twice for the same day.
export async function markPracticeDay(date: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`INSERT OR IGNORE INTO practice_days (date) VALUES (?)`, [date]);
}

export async function getPracticeMarkerDates(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ date: string }>(`SELECT date FROM practice_days ORDER BY date ASC`);
  return rows.map((r) => r.date);
}

export async function hasPracticeMarker(date: string): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM practice_days WHERE date = ?`, [date]);
  return (row?.n ?? 0) > 0;
}
