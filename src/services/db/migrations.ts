import type { SQLiteDatabase } from "expo-sqlite";
import { TOPICS } from "../../data/topics";
import { DIFFICULTY_OVERRIDES, defaultDifficultyTier } from "../../domain/promptDifficulty";

// Bump this and add a new numbered migration when the schema changes.
export const LATEST_DB_VERSION = 8;

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

  if (currentVersion < 6) {
    // Both nullable, NULL meaning "not deleted." video_deleted_at supports
    // the lighter "delete video only" action (frees storage, keeps the
    // session fully intact). deleted_at is a soft delete for "Delete
    // Session" — hides it from History, but the row is never actually
    // removed so Trends' streaks/averages keep counting it forever.
    await db.execAsync(`
      ALTER TABLE sessions ADD COLUMN video_deleted_at TEXT;
    `);
    await db.execAsync(`
      ALTER TABLE sessions ADD COLUMN deleted_at TEXT;
    `);
    currentVersion = 6;
  }

  if (currentVersion < 7) {
    // Script Practice mode: a session recorded against a fixed script
    // (src/data/scripts.json) instead of a spontaneous prompt. session_type
    // distinguishes it from 'spontaneous'/'free_record' so History/Trends can
    // label it distinctly; script_id and cues_enabled are only ever set
    // alongside session_type = 'script_practice'.
    await db.execAsync(`
      ALTER TABLE sessions ADD COLUMN session_type TEXT NOT NULL DEFAULT 'spontaneous';
    `);
    await db.execAsync(`
      ALTER TABLE sessions ADD COLUMN script_id TEXT;
    `);
    await db.execAsync(`
      ALTER TABLE sessions ADD COLUMN cues_enabled INTEGER;
    `);
    // Nullable (unlike the other score columns) — only meaningful for
    // script_practice sessions, so NULL here means "not applicable" rather
    // than "scored zero."
    await db.execAsync(`
      ALTER TABLE scores ADD COLUMN cue_compliance_score INTEGER;
    `);
    await db.execAsync(`
      ALTER TABLE scores ADD COLUMN cue_compliance_notes TEXT;
    `);
    currentVersion = 7;
  }

  if (currentVersion < 8) {
    // Prompts move from a static in-memory array to a real table so they can
    // be browsed, filtered by difficulty, and user-authored (Prompt Library).
    // No FK/CHECK to sessions.prompt_id — deliberately, matching every other
    // column in this file that references an id — a later prompt edit/delete
    // must never be able to orphan-break session history lookups.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS prompts (
        id TEXT PRIMARY KEY NOT NULL,
        category TEXT NOT NULL,
        text TEXT NOT NULL,
        difficulty_tier TEXT NOT NULL,
        is_user_created INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        deleted_at TEXT
      );
    `);

    // Seed from the static curated bank so existing installs (whose sessions
    // already reference t001..t140 in sessions.prompt_id) keep resolving,
    // with zero network/AI dependency. INSERT OR IGNORE + the version gate
    // above make this idempotent even if migrations were ever re-run after a
    // partial failure. Bound params (rather than one hand-built literal SQL
    // string) avoid manually escaping apostrophes in prompt text like "you've".
    const seededAt = new Date().toISOString();
    await db.withTransactionAsync(async () => {
      for (const topic of TOPICS) {
        const tier = DIFFICULTY_OVERRIDES[topic.id] ?? defaultDifficultyTier(topic.category, topic.text);
        await db.runAsync(
          `INSERT OR IGNORE INTO prompts (id, category, text, difficulty_tier, is_user_created, created_at, deleted_at)
           VALUES (?, ?, ?, ?, 0, ?, NULL)`,
          [topic.id, topic.category, topic.text, tier, seededAt],
        );
      }
    });

    currentVersion = 8;
  }

  await db.execAsync(`PRAGMA user_version = ${currentVersion}`);
}
