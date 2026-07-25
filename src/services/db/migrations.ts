import type { SQLiteDatabase } from "expo-sqlite";

// Bump this and add a new numbered migration when the schema changes.
export const LATEST_DB_VERSION = 1;

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  let currentVersion = row?.user_version ?? 0;

  if (currentVersion < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY NOT NULL,
        prompt_id TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        video_path TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL DEFAULT 0,
        transcription_source TEXT NOT NULL DEFAULT 'gemini',
        transcript_verbatim TEXT,
        transcript_clean TEXT,
        status TEXT NOT NULL DEFAULT 'recording',
        notion_synced_at TEXT
      );
    `);
    currentVersion = 1;
  }

  await db.execAsync(`PRAGMA user_version = ${currentVersion}`);
}
