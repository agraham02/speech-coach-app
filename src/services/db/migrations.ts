import type { SQLiteDatabase } from "expo-sqlite";

// Bump this and add a new numbered migration when the schema changes.
export const LATEST_DB_VERSION = 5;

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

  if (currentVersion < 2) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS scores (
        session_id TEXT PRIMARY KEY NOT NULL REFERENCES sessions(id),
        structure_score INTEGER NOT NULL,
        structure_used TEXT NOT NULL,
        structure_notes TEXT NOT NULL,
        rate_score INTEGER NOT NULL,
        rate_wpm_avg INTEGER NOT NULL,
        rate_notes TEXT NOT NULL,
        volume_score INTEGER NOT NULL,
        volume_notes TEXT NOT NULL,
        pitch_melody_score INTEGER NOT NULL,
        pitch_melody_notes TEXT NOT NULL,
        tonality_score INTEGER NOT NULL,
        tonality_notes TEXT NOT NULL,
        pausing_score INTEGER NOT NULL,
        pausing_notes TEXT NOT NULL,
        coaching_summary TEXT NOT NULL,
        top_strength TEXT NOT NULL,
        top_focus_area TEXT NOT NULL,
        recommended_drill TEXT NOT NULL
      );
    `);
    currentVersion = 2;
  }

  if (currentVersion < 3) {
    await db.execAsync(`
      ALTER TABLE scores ADD COLUMN eye_contact_score INTEGER NOT NULL DEFAULT 0;
    `);
    await db.execAsync(`
      ALTER TABLE scores ADD COLUMN facial_expressiveness_score INTEGER NOT NULL DEFAULT 0;
    `);
    await db.execAsync(`
      ALTER TABLE scores ADD COLUMN body_language_notes TEXT NOT NULL DEFAULT '';
    `);
    await db.execAsync(`
      ALTER TABLE scores ADD COLUMN face_voice_congruence_score INTEGER NOT NULL DEFAULT 0;
    `);
    await db.execAsync(`
      ALTER TABLE scores ADD COLUMN archetype_detected TEXT NOT NULL DEFAULT 'Educator';
    `);
    await db.execAsync(`
      ALTER TABLE scores ADD COLUMN archetype_fit_for_topic TEXT NOT NULL DEFAULT '';
    `);
    await db.execAsync(`
      ALTER TABLE scores ADD COLUMN overall_score INTEGER NOT NULL DEFAULT 0;
    `);
    currentVersion = 3;
  }

  if (currentVersion < 4) {
    // Persist the per-session save-time choices so re-opening an in-progress
    // or errored session later (e.g. from History, possibly after an app
    // restart) knows what was actually requested instead of guessing.
    await db.execAsync(`
      ALTER TABLE sessions ADD COLUMN wants_grading INTEGER NOT NULL DEFAULT 1;
    `);
    // Default true (not the new prompted-session default of off) because this
    // backfills pre-existing rows, which were all created back when Notion
    // sync was automatic for every session. New rows never rely on this
    // default — insertSession always passes an explicit value — so this only
    // affects retrying an old in-progress/errored session after upgrading.
    await db.execAsync(`
      ALTER TABLE sessions ADD COLUMN wants_notion_sync INTEGER NOT NULL DEFAULT 1;
    `);
    currentVersion = 4;
  }

  if (currentVersion < 5) {
    // Filler-word stats are computed on-device right after transcription
    // (see computeFillerStats), independent of whether grading happened —
    // nullable since they're populated in a follow-up write, not the initial insert.
    await db.execAsync(`
      ALTER TABLE sessions ADD COLUMN filler_word_count INTEGER;
    `);
    await db.execAsync(`
      ALTER TABLE sessions ADD COLUMN filler_rate_per_minute REAL;
    `);
    // Content dimension (relevance + coherence) and Gemini's evidence
    // annotations, added alongside the rigor/grading-philosophy prompt rewrite.
    await db.execAsync(`
      ALTER TABLE scores ADD COLUMN content_relevance_score INTEGER NOT NULL DEFAULT 0;
    `);
    await db.execAsync(`
      ALTER TABLE scores ADD COLUMN content_relevance_notes TEXT NOT NULL DEFAULT '';
    `);
    await db.execAsync(`
      ALTER TABLE scores ADD COLUMN content_coherence_score INTEGER NOT NULL DEFAULT 0;
    `);
    await db.execAsync(`
      ALTER TABLE scores ADD COLUMN content_coherence_notes TEXT NOT NULL DEFAULT '';
    `);
    await db.execAsync(`
      ALTER TABLE scores ADD COLUMN annotations_json TEXT NOT NULL DEFAULT '[]';
    `);
    currentVersion = 5;
  }

  await db.execAsync(`PRAGMA user_version = ${currentVersion}`);
}
