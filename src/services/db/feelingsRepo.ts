import { getDatabase } from "./database";
import { rotationEmotion, weekStart, type EmotionId } from "../../domain/feelings";
import { isoDateFromDate, todayISODate } from "../../utils/dateUtils";

export interface FeelingWeek {
  weekStart: string;
  emotion: EmotionId;
  swapped: boolean;
  // Reps recorded this week (local dates).
  reps: number;
}

// This week's emotion — the rotation's, unless it was swapped — and how many
// reps you've done this week.
export async function getFeelingWeek(today = todayISODate()): Promise<FeelingWeek> {
  const db = await getDatabase();
  const start = weekStart(today);
  const row = await db.getFirstAsync<{ emotion: string; swapped: number }>(`SELECT emotion, swapped FROM feeling_weeks WHERE week_start = ?`, [start]);
  // The first week you see this anchors the rotation (on joy).
  const first = await db.getFirstAsync<{ week_start: string }>(`SELECT MIN(week_start) AS week_start FROM feeling_weeks`);
  const firstWeek = first?.week_start ?? start;
  if (!first?.week_start) {
    await db.runAsync(`INSERT OR IGNORE INTO feeling_weeks (week_start, emotion, swapped) VALUES (?, ?, 0)`, [start, rotationEmotion(start, start)]);
  }
  // recorded_at is UTC: compare local dates, never the ISO string's prefix.
  const recent = await db.getAllAsync<{ recorded_at: string }>(
    `SELECT recorded_at FROM sessions WHERE session_type = 'feeling' AND deleted_at IS NULL AND recorded_at >= ?`,
    [new Date(Date.now() - 9 * 86_400_000).toISOString()],
  );
  const reps = recent.filter((r) => isoDateFromDate(new Date(r.recorded_at)) >= start).length;
  return {
    weekStart: start,
    emotion: (row?.emotion as EmotionId | undefined) ?? rotationEmotion(firstWeek, start),
    swapped: row?.swapped === 1,
    reps,
  };
}

export async function swapFeelingWeek(start: string, emotion: EmotionId): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO feeling_weeks (week_start, emotion, swapped) VALUES (?, ?, 1)
     ON CONFLICT(week_start) DO UPDATE SET emotion = excluded.emotion, swapped = 1`,
    [start, emotion],
  );
}
