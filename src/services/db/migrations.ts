import type { SQLiteDatabase } from "expo-sqlite";
import { TOPICS } from "../../data/topics";
import { DIFFICULTY_OVERRIDES, defaultDifficultyTier } from "../../domain/promptDifficulty";
import { inferLegacySteps, type LegacySessionSignals } from "../../domain/sessionSteps";
import type { SessionStatus } from "../../domain/sessionTypes";
import { logger } from "../../utils/logger";

// Bump this and add a new numbered migration when the schema changes.
export const LATEST_DB_VERSION = 29;

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
    currentVersion = await commitVersion(db, 1);
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
    currentVersion = await commitVersion(db, 2);
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
    currentVersion = await commitVersion(db, 3);
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
    currentVersion = await commitVersion(db, 4);
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
    currentVersion = await commitVersion(db, 5);
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
    currentVersion = await commitVersion(db, 6);
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
    currentVersion = await commitVersion(db, 7);
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

    currentVersion = await commitVersion(db, 8);
  }

  if (currentVersion < 9) {
    // Plan Your Point (PREP framework), captured before recording starts —
    // nullable, populated only for prompt-mode sessions where the setting
    // was on and the speaker filled in at least one field (see
    // planYourPoint.ts's planTextToNullableFields).
    await db.execAsync(`
      ALTER TABLE sessions ADD COLUMN plan_point_text TEXT;
    `);
    await db.execAsync(`
      ALTER TABLE sessions ADD COLUMN plan_reason_text TEXT;
    `);
    await db.execAsync(`
      ALTER TABLE sessions ADD COLUMN plan_example_text TEXT;
    `);
    currentVersion = await commitVersion(db, 9);
  }

  if (currentVersion < 10) {
    // Audio-first pipeline (Phase 2) — all nullable, populated in a
    // follow-up write after transcription/analysis completes, independent
    // of wants_grading (same convention as filler_word_count/v5).
    await db.execAsync(`
      ALTER TABLE sessions ADD COLUMN transcript_words_json TEXT;
    `);
    await db.execAsync(`
      ALTER TABLE sessions ADD COLUMN wpm_curve_json TEXT;
    `);
    await db.execAsync(`
      ALTER TABLE sessions ADD COLUMN repeated_word_count INTEGER;
    `);
    await db.execAsync(`
      ALTER TABLE sessions ADD COLUMN assemblyai_transcript_id TEXT;
    `);
    // On-device DSP (pitch/volume) — dsp_status is NULL until a session
    // actually attempts analysis (so it's distinguishable from a session
    // that ran the analysis and got 'failed').
    await db.execAsync(`
      ALTER TABLE sessions ADD COLUMN dsp_status TEXT;
    `);
    await db.execAsync(`
      ALTER TABLE sessions ADD COLUMN pitch_contour_json TEXT;
    `);
    await db.execAsync(`
      ALTER TABLE sessions ADD COLUMN volume_envelope_json TEXT;
    `);
    await db.execAsync(`
      ALTER TABLE sessions ADD COLUMN pitch_avg_hz REAL;
    `);
    await db.execAsync(`
      ALTER TABLE sessions ADD COLUMN pitch_min_hz REAL;
    `);
    await db.execAsync(`
      ALTER TABLE sessions ADD COLUMN pitch_max_hz REAL;
    `);
    await db.execAsync(`
      ALTER TABLE sessions ADD COLUMN volume_avg_dbfs REAL;
    `);
    await db.execAsync(`
      ALTER TABLE sessions ADD COLUMN volume_stddev_dbfs REAL;
    `);
    currentVersion = await commitVersion(db, 10);
  }

  if (currentVersion < 11) {
    // Tongue-Twister Drill mode (Phase 3) — separate from `sessions`
    // entirely: drills have no video, no Gemini grading, no prompt_id. One
    // row per completed attempt (including manual-timer-fallback attempts,
    // which just have accuracy_percent = 0 — see drillScoring.ts).
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS drill_completions (
        id TEXT PRIMARY KEY NOT NULL,
        twister_id TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        accuracy_percent REAL NOT NULL,
        wpm REAL NOT NULL,
        difficulty TEXT NOT NULL
      );
    `);
    currentVersion = await commitVersion(db, 11);
  }

  if (currentVersion < 12) {
    // Adaptive Curriculum Engine (Phase 5) — one row per *actual* level
    // change (not per evaluation), so this stays tiny. spontaneous_session_count
    // is the cooldown checkpoint curriculum.ts's evaluateCurriculum() counts
    // new eligible sessions from; direction is 'up' | 'down' | 'initial'.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS curriculum_state (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        changed_at TEXT NOT NULL,
        level INTEGER NOT NULL,
        direction TEXT NOT NULL,
        spontaneous_composite REAL,
        drill_composite REAL,
        spontaneous_session_count INTEGER NOT NULL,
        reason_code TEXT NOT NULL
      );
    `);
    currentVersion = await commitVersion(db, 12);
  }

  if (currentVersion < 13) {
    // Lets a retry after a failed *analysis* step (upload succeeded,
    // generateContent or schema parsing failed) skip re-uploading the video
    // and reuse the still-valid Gemini file instead — see
    // transcribeSession.ts's resolveUploadForGrading. All nullable: null
    // means "no upload on record" (never attempted yet, or the stored
    // reference turned out to be expired/gone and wasn't reused).
    await db.execAsync(`
      ALTER TABLE sessions ADD COLUMN gemini_file_name TEXT;
    `);
    await db.execAsync(`
      ALTER TABLE sessions ADD COLUMN gemini_file_uri TEXT;
    `);
    await db.execAsync(`
      ALTER TABLE sessions ADD COLUMN gemini_file_uploaded_at TEXT;
    `);
    currentVersion = await commitVersion(db, 13);
  }

  if (currentVersion < 14) {
    // Session lifecycle redesign: per-step state (so any piece of analysis
    // can be retried or resumed on its own), JSON artifacts for new
    // analysis outputs, a relative video file name (iOS app-container paths
    // change between builds), and a generalized drill_attempts table whose
    // accuracy is nullable (manual-timer attempts used to store 0, which
    // dragged the curriculum's drill score down).
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS session_steps (
          session_id TEXT NOT NULL,
          step TEXT NOT NULL,
          status TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (session_id, step)
        );
        CREATE INDEX IF NOT EXISTS idx_session_steps_status ON session_steps(status);
        CREATE TABLE IF NOT EXISTS session_artifacts (
          session_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (session_id, kind)
        );
        CREATE TABLE IF NOT EXISTS drill_attempts (
          id TEXT PRIMARY KEY NOT NULL,
          drill_type TEXT NOT NULL,
          content_id TEXT,
          difficulty TEXT,
          started_at TEXT NOT NULL,
          mode TEXT NOT NULL DEFAULT 'live',
          accuracy_percent REAL,
          clean_word_percent REAL,
          wpm REAL,
          metrics_json TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_drill_attempts_started ON drill_attempts(started_at);
      `);
      await addColumnIfMissing(db, "sessions", "video_file", "TEXT");
      await addColumnIfMissing(db, "sessions", "last_error", "TEXT");
      await addColumnIfMissing(db, "sessions", "updated_at", "TEXT");
      await addColumnIfMissing(db, "sessions", "subject_json", "TEXT");
      await addColumnIfMissing(db, "sessions", "notion_block_id", "TEXT");

      // Historical manual-timer attempts were saved with accuracy 0.
      await db.execAsync(`
        INSERT OR IGNORE INTO drill_attempts (id, drill_type, content_id, difficulty, started_at, mode, accuracy_percent, wpm)
        SELECT id, 'twister', twister_id, difficulty, completed_at,
               CASE WHEN accuracy_percent = 0 THEN 'manual' ELSE 'live' END,
               CASE WHEN accuracy_percent = 0 THEN NULL ELSE accuracy_percent END,
               wpm
        FROM drill_completions;
      `);

      const sessions = await db.getAllAsync<{
        id: string;
        video_path: string;
        status: string;
        transcript_clean: string | null;
        dsp_status: string | null;
        wants_grading: number;
        has_scores: number;
      }>(`
        SELECT s.id, s.video_path, s.status, s.transcript_clean, s.dsp_status,
               s.wants_grading,
               CASE WHEN sc.session_id IS NULL THEN 0 ELSE 1 END AS has_scores
        FROM sessions s LEFT JOIN scores sc ON sc.session_id = s.id
      `);
      const now = new Date().toISOString();
      for (const row of sessions) {
        const fileName = row.video_path.split("/").pop() ?? null;
        await db.runAsync(`UPDATE sessions SET video_file = COALESCE(video_file, ?), updated_at = COALESCE(updated_at, ?) WHERE id = ?`, [
          fileName,
          now,
          row.id,
        ]);
        const signals: LegacySessionSignals = {
          status: row.status as SessionStatus,
          hasTranscript: !!row.transcript_clean,
          dspStatus: row.dsp_status,
          hasScores: row.has_scores === 1,
          wantsGrading: row.wants_grading === 1,
        };
        for (const step of inferLegacySteps(signals)) {
          await db.runAsync(
            `INSERT OR IGNORE INTO session_steps (session_id, step, status, attempts, last_error, updated_at) VALUES (?, ?, ?, 0, ?, ?)`,
            [row.id, step.step, step.status, step.lastError, now],
          );
        }
      }
    });
    currentVersion = await commitVersion(db, 14);
  }

  if (currentVersion < 15) {
    // Curriculum v2: per-skill mastery, per-drill adaptive difficulty,
    // lesson progress with spaced review, daily plans, and three-pass
    // review completion.
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS skill_mastery (
          skill TEXT PRIMARY KEY NOT NULL,
          rating REAL NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_practiced_at TEXT
        );
        CREATE TABLE IF NOT EXISTS drill_difficulty (
          drill_type TEXT PRIMARY KEY NOT NULL,
          level REAL NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          successes INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS lesson_progress (
          lesson_id TEXT PRIMARY KEY NOT NULL,
          done INTEGER NOT NULL DEFAULT 0,
          completed_at TEXT,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_score REAL,
          review_interval_days INTEGER,
          next_review_at TEXT
        );
        CREATE TABLE IF NOT EXISTS daily_plans (
          date TEXT PRIMARY KEY NOT NULL,
          plan_json TEXT NOT NULL,
          completed_steps_json TEXT NOT NULL DEFAULT '[]',
          completed_at TEXT
        );
        CREATE TABLE IF NOT EXISTS review_passes (
          session_id TEXT NOT NULL,
          pass TEXT NOT NULL,
          completed_at TEXT NOT NULL,
          PRIMARY KEY (session_id, pass)
        );
      `);
      await addColumnIfMissing(db, "drill_attempts", "skill", "TEXT");
      await addColumnIfMissing(db, "drill_attempts", "lesson_id", "TEXT");
      await addColumnIfMissing(db, "drill_attempts", "drill_level", "REAL");
      await addColumnIfMissing(db, "drill_attempts", "score", "REAL");
      await addColumnIfMissing(db, "drill_attempts", "success", "INTEGER");
      await db.execAsync(`UPDATE drill_attempts SET skill = 'articulation' WHERE drill_type = 'twister' AND skill IS NULL;`);

      // Seed the impromptu-rep difficulty from the v1 curriculum level (1-5
      // maps onto the 1-10 scale), so existing progress isn't thrown away.
      const v1 = await db.getFirstAsync<{ level: number }>(`SELECT level FROM curriculum_state ORDER BY changed_at DESC LIMIT 1`);
      const now = new Date().toISOString();
      const repLevel = v1 ? Math.max(1, v1.level * 2 - 1) : 1;
      await db.runAsync(
        `INSERT OR IGNORE INTO drill_difficulty (drill_type, level, attempts, successes, updated_at) VALUES ('rep', ?, 0, 0, ?)`,
        [repLevel, now],
      );
      // Twister history seeds articulation: the mean of recent live scores.
      const twister = await db.getFirstAsync<{ avg: number | null; n: number; last: string | null }>(
        `SELECT AVG(accuracy_percent) AS avg, COUNT(*) AS n, MAX(started_at) AS last FROM drill_attempts WHERE drill_type = 'twister' AND accuracy_percent IS NOT NULL`,
      );
      if (twister && twister.n > 0 && twister.avg != null) {
        await db.runAsync(
          `INSERT OR IGNORE INTO skill_mastery (skill, rating, attempts, last_practiced_at) VALUES ('articulation', ?, ?, ?)`,
          // Never below the default start: early history can include
          // junk 0% attempts (e.g. a muted mic).
          [Math.round(Math.max(25, Math.min(60, twister.avg * 0.5))), Math.min(twister.n, 10), twister.last],
        );
      }
    });
    currentVersion = await commitVersion(db, 15);
  }

  if (currentVersion < 16) {
    // Conversation skill, real-world side: Prime → Debrief events (with the
    // predicted vs actual awkwardness), moments you blanked (replayed as
    // practice), and daily mission taps.
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS social_events (
          id TEXT PRIMARY KEY NOT NULL,
          created_at TEXT NOT NULL,
          label TEXT,
          topics_json TEXT,
          questions_json TEXT,
          outward_goal TEXT,
          predicted_awkward INTEGER,
          happened_at TEXT,
          debrief_json TEXT,
          actual_awkward INTEGER,
          completed_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_social_events_created ON social_events(created_at);
        CREATE TABLE IF NOT EXISTS blank_moments (
          id TEXT PRIMARY KEY NOT NULL,
          event_id TEXT,
          text TEXT NOT NULL,
          created_at TEXT NOT NULL,
          practiced_count INTEGER NOT NULL DEFAULT 0,
          last_practiced_at TEXT,
          deleted_at TEXT
        );
        CREATE TABLE IF NOT EXISTS mission_log (
          date TEXT NOT NULL,
          mission_id TEXT NOT NULL,
          count INTEGER NOT NULL DEFAULT 0,
          completed_at TEXT,
          PRIMARY KEY (date, mission_id)
        );
      `);
    });
    currentVersion = await commitVersion(db, 16);
  }

  if (currentVersion < 17) {
    // Conversation log (debriefs can be deleted), progress keepsake videos
    // (one kept per month, compressed, when old videos are cleared), and
    // the combined local + cloud session score.
    await addColumnIfMissing(db, "social_events", "deleted_at", "TEXT");
    await addColumnIfMissing(db, "sessions", "video_keepsake", "INTEGER NOT NULL DEFAULT 0");
    await addColumnIfMissing(db, "sessions", "video_compressed_at", "TEXT");
    await addColumnIfMissing(db, "sessions", "session_score", "REAL");
    currentVersion = await commitVersion(db, 17);
  }

  if (currentVersion < 18) {
    // Mark It Up: your own marked lines (built-in lines and speeches stay
    // static content; only your texts and edited copies live here).
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS marked_texts (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        shelf TEXT NOT NULL,
        source_id TEXT,
        text TEXT NOT NULL,
        marks_json TEXT NOT NULL,
        auto_marked INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        last_practiced_at TEXT,
        deleted_at TEXT
      );
    `);
    currentVersion = await commitVersion(db, 18);
  }

  if (currentVersion < 19) {
    // Feeling of the Week: the week's emotion (from the rotation, or swapped).
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS feeling_weeks (
        week_start TEXT PRIMARY KEY NOT NULL,
        emotion TEXT NOT NULL,
        swapped INTEGER NOT NULL DEFAULT 0
      );
    `);
    currentVersion = await commitVersion(db, 19);
  }

  if (currentVersion < 20) {
    // Daily goal: top-up sessions 2 and 3 (session 1 stays in daily_plans).
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS daily_topups (
        date TEXT NOT NULL,
        slot INTEGER NOT NULL,
        plan_json TEXT NOT NULL,
        completed_steps_json TEXT NOT NULL DEFAULT '[]',
        completed_at TEXT,
        PRIMARY KEY (date, slot)
      );
    `);
    currentVersion = await commitVersion(db, 20);
  }

  if (currentVersion < 21) {
    // Onboarding: skill checks (and the 30-day retake) and the monthly
    // "how do you feel about speaking?" check-in.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS skill_checks (
        id TEXT PRIMARY KEY NOT NULL,
        taken_at TEXT NOT NULL,
        topic_id TEXT,
        session_id TEXT,
        pieces_json TEXT NOT NULL DEFAULT '{}',
        results_json TEXT,
        felt INTEGER,
        retake_of TEXT
      );
      CREATE TABLE IF NOT EXISTS confidence_checkins (
        date TEXT PRIMARY KEY NOT NULL,
        rating INTEGER NOT NULL
      );
    `);
    currentVersion = await commitVersion(db, 21);
  }

  if (currentVersion < 22) {
    // The Notion journal is gone: drop its step rows and columns. A column
    // that can't be dropped is harmless (inserts no longer name it), so a
    // failure there is logged, never fatal.
    await db.execAsync(`DELETE FROM session_steps WHERE step = 'notion';`);
    for (const column of ["notion_synced_at", "wants_notion_sync", "notion_block_id"]) {
      await dropColumnIfPresent(db, "sessions", column);
    }
    currentVersion = await commitVersion(db, 22);
  }

  if (currentVersion < 23) {
    // AssemblyAI cloud transcription is gone too.
    await dropColumnIfPresent(db, "sessions", "assemblyai_transcript_id");
    currentVersion = await commitVersion(db, 23);
  }

  if (currentVersion < 24) {
    // Phrasebook: phrases and lines you want to remember, to hear again and
    // say aloud. Plain text, never sent anywhere.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS saved_phrases (
        id TEXT PRIMARY KEY NOT NULL,
        text TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL,
        practiced_count INTEGER NOT NULL DEFAULT 0,
        last_practiced_at TEXT,
        deleted_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_saved_phrases_created ON saved_phrases(created_at);
    `);
    currentVersion = await commitVersion(db, 24);
  }

  if (currentVersion < 25) {
    // Three things: what you like about yourself, one to three a day, never
    // repeated. A round is 30 days of entries. Plain text, never sent anywhere.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS self_likes (
        id TEXT PRIMARY KEY NOT NULL,
        date TEXT NOT NULL,
        text TEXT NOT NULL,
        prompt_id TEXT,
        round INTEGER NOT NULL DEFAULT 1,
        said_at TEXT,
        created_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_self_likes_date ON self_likes(date);
    `);
    currentVersion = await commitVersion(db, 25);
  }

  if (currentVersion < 26) {
    // Talk back: the worries your inner critic raises about speaking, and each
    // time you looked at one fairly (a thought record). Local only. A preset
    // worry can only be active once, so going back and forth in onboarding
    // never makes duplicates.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS self_talk_thoughts (
        id TEXT PRIMARY KEY NOT NULL,
        text TEXT NOT NULL,
        preset_id TEXT,
        source TEXT NOT NULL DEFAULT 'added',
        created_at TEXT NOT NULL,
        archived_at TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_self_talk_thoughts_preset
        ON self_talk_thoughts(preset_id) WHERE preset_id IS NOT NULL AND archived_at IS NULL;
      CREATE TABLE IF NOT EXISTS self_talk_challenges (
        id TEXT PRIMARY KEY NOT NULL,
        thought_id TEXT NOT NULL,
        belief_before INTEGER NOT NULL,
        evidence_for TEXT,
        evidence_against TEXT,
        balanced TEXT,
        belief_after INTEGER,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_self_talk_challenges_thought ON self_talk_challenges(thought_id, created_at);
    `);
    currentVersion = await commitVersion(db, 26);
  }

  if (currentVersion < 27) {
    // Rewind: the end-of-day spoken recall. Kept apart from `sessions`, so a
    // recall never reaches History, scores, stats or video keepsakes. The
    // audio is one WAV in the app's documents folder; the transcript, the
    // counted details and the coach's notes live here. Local only.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS day_recalls (
        id TEXT PRIMARY KEY NOT NULL,
        date TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        audio_file TEXT,
        duration_seconds INTEGER NOT NULL DEFAULT 0,
        transcript TEXT,
        transcript_source TEXT,
        stats_json TEXT,
        review_json TEXT,
        review_source TEXT,
        status TEXT NOT NULL DEFAULT 'processing',
        deleted_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_day_recalls_date ON day_recalls(date);
    `);
    currentVersion = await commitVersion(db, 27);
  }

  if (currentVersion < 28) {
    // Every change to a skill's mastery rating, with what caused it — for
    // the skill detail screen's "what moved this number". `score` is the
    // 0-1 result, `expected` what the rating predicted at that difficulty;
    // the gap between them is what moved it. Starts empty: changes from
    // before this table can't be reconstructed.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS skill_events (
        id TEXT PRIMARY KEY NOT NULL,
        skill TEXT NOT NULL,
        at TEXT NOT NULL,
        rating_before REAL NOT NULL,
        rating_after REAL NOT NULL,
        source TEXT NOT NULL,
        label TEXT NOT NULL,
        score REAL,
        expected REAL,
        level REAL,
        session_id TEXT,
        drill_type TEXT,
        detail_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_skill_events_skill ON skill_events(skill, at);
    `);
    currentVersion = await commitVersion(db, 28);
  }

  if (currentVersion < 29) {
    // Things you're speaking at (domain/events.ts), several at a time, each
    // with a check-in before and after. Replaces the single event onboarding
    // kept in the profile; eventsRepo imports that one on launch.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS speaking_events (
        id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL,
        title TEXT,
        event_date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        before_json TEXT,
        after_json TEXT,
        deleted_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_speaking_events_date ON speaking_events(event_date);
    `);
    currentVersion = await commitVersion(db, 29);
  }
}

// Commits each migration's version as soon as that migration finishes.
// Previously user_version was only written once at the very end, so a
// failure partway through re-ran already-applied ALTER TABLEs next launch
// and failed forever on "duplicate column".
async function commitVersion(db: SQLiteDatabase, version: number): Promise<number> {
  await db.execAsync(`PRAGMA user_version = ${version}`);
  return version;
}

async function dropColumnIfPresent(db: SQLiteDatabase, table: string, column: string): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!columns.some((c) => c.name === column)) return;
  try {
    await db.execAsync(`ALTER TABLE ${table} DROP COLUMN ${column};`);
  } catch (error) {
    logger.warn(`[db] couldn't drop ${table}.${column} — ${(error as Error).message}`);
  }
}

async function addColumnIfMissing(db: SQLiteDatabase, table: string, column: string, type: string): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (columns.some((c) => c.name === column)) return;
  await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type};`);
}
