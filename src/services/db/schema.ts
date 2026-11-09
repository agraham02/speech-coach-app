import type { SQLiteDatabase } from "expo-sqlite";
import { TOPICS } from "../../data/topics";
import { DIFFICULTY_OVERRIDES, defaultDifficultyTier } from "../../domain/promptDifficulty";
import { logger } from "../../utils/logger";

// The database schema, as of version 2.0.0 (the overhaul's clean start).
//
// There are no migrations from before 2.0.0. The 1.x database was test data
// only, so a database from before this schema is wiped and rebuilt the first
// time the app opens it (docs/overhaul/PLAN.md, section 14, "No backwards
// compatibility"). A database the app has already built at this version is
// left alone. user_version holds the schema version.
//
// Changing the schema: leave SCHEMA_SQL (the 2.0 baseline, version 37) alone
// and add a numbered step to STEPS. A new install builds the baseline and then
// every step; a phone already at an earlier version runs just the steps it
// hasn't had, in order, in one transaction. Nothing before the baseline is
// ever migrated.

// 36 was the last 1.x version. Anything below the baseline is wiped.
export const BASELINE_VERSION = 37;

const SCHEMA_SQL = `
CREATE TABLE blank_moments (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  practiced_count INTEGER NOT NULL DEFAULT 0,
  last_practiced_at TEXT,
  deleted_at TEXT
);

CREATE TABLE confidence_checkins (
  date TEXT PRIMARY KEY NOT NULL,
  rating INTEGER NOT NULL
);

CREATE TABLE curriculum_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  changed_at TEXT NOT NULL,
  level INTEGER NOT NULL,
  direction TEXT NOT NULL,
  spontaneous_session_count INTEGER NOT NULL,
  reason_code TEXT NOT NULL
);

CREATE TABLE daily_plans (
  date TEXT PRIMARY KEY NOT NULL,
  plan_json TEXT NOT NULL,
  completed_steps_json TEXT NOT NULL DEFAULT '[]',
  completed_at TEXT
);

CREATE TABLE daily_topups (
  date TEXT NOT NULL,
  slot INTEGER NOT NULL,
  plan_json TEXT NOT NULL,
  completed_steps_json TEXT NOT NULL DEFAULT '[]',
  completed_at TEXT,
  PRIMARY KEY (date, slot)
);

CREATE TABLE day_recalls (
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
  deleted_at TEXT,
  words_json TEXT,
  pending_json TEXT
);

CREATE TABLE drill_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  drill_type TEXT NOT NULL,
  content_id TEXT,
  difficulty TEXT,
  started_at TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'live',
  accuracy_percent REAL,
  clean_word_percent REAL,
  wpm REAL,
  metrics_json TEXT,
  skill TEXT,
  lesson_id TEXT,
  drill_level REAL,
  score REAL,
  success INTEGER
);

CREATE TABLE drill_completions (
  id TEXT PRIMARY KEY NOT NULL,
  twister_id TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  accuracy_percent REAL NOT NULL,
  wpm REAL NOT NULL,
  difficulty TEXT NOT NULL
);

CREATE TABLE drill_difficulty (
  drill_type TEXT PRIMARY KEY NOT NULL,
  level REAL NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  successes INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE feeling_weeks (
  week_start TEXT PRIMARY KEY NOT NULL,
  emotion TEXT NOT NULL,
  swapped INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE lesson_progress (
  lesson_id TEXT PRIMARY KEY NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_score REAL,
  review_interval_days INTEGER,
  next_review_at TEXT
);

CREATE TABLE marked_texts (
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

CREATE TABLE mission_log (
  date TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  PRIMARY KEY (date, mission_id)
);

CREATE TABLE path_changes (
  id TEXT PRIMARY KEY NOT NULL,
  at TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  seen_at TEXT
);

CREATE TABLE path_units (
  unit_id TEXT PRIMARY KEY NOT NULL,
  position INTEGER NOT NULL,
  status TEXT NOT NULL,
  reasons_json TEXT NOT NULL DEFAULT '[]',
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE practice_days (
  date TEXT PRIMARY KEY NOT NULL
);

CREATE TABLE prompts (
  id TEXT PRIMARY KEY NOT NULL,
  category TEXT NOT NULL,
  text TEXT NOT NULL,
  difficulty_tier TEXT NOT NULL,
  is_user_created INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE review_passes (
  session_id TEXT NOT NULL,
  pass TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  PRIMARY KEY (session_id, pass)
);

CREATE TABLE saved_phrases (
  id TEXT PRIMARY KEY NOT NULL,
  text TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  practiced_count INTEGER NOT NULL DEFAULT 0,
  last_practiced_at TEXT,
  deleted_at TEXT
);

CREATE TABLE scores (
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
  recommended_drill TEXT NOT NULL,
  eye_contact_score INTEGER NOT NULL DEFAULT 0,
  facial_expressiveness_score INTEGER NOT NULL DEFAULT 0,
  body_language_notes TEXT NOT NULL DEFAULT '',
  face_voice_congruence_score INTEGER NOT NULL DEFAULT 0,
  archetype_detected TEXT NOT NULL DEFAULT 'Educator',
  archetype_fit_for_topic TEXT NOT NULL DEFAULT '',
  overall_score INTEGER NOT NULL DEFAULT 0,
  content_relevance_score INTEGER NOT NULL DEFAULT 0,
  content_relevance_notes TEXT NOT NULL DEFAULT '',
  content_coherence_score INTEGER NOT NULL DEFAULT 0,
  content_coherence_notes TEXT NOT NULL DEFAULT '',
  annotations_json TEXT NOT NULL DEFAULT '[]',
  cue_compliance_score INTEGER,
  cue_compliance_notes TEXT
);

CREATE TABLE self_likes (
  id TEXT PRIMARY KEY NOT NULL,
  date TEXT NOT NULL,
  text TEXT NOT NULL,
  prompt_id TEXT,
  round INTEGER NOT NULL DEFAULT 1,
  said_at TEXT,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE self_talk_challenges (
  id TEXT PRIMARY KEY NOT NULL,
  thought_id TEXT NOT NULL,
  belief_before INTEGER NOT NULL,
  evidence_for TEXT,
  evidence_against TEXT,
  balanced TEXT,
  belief_after INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE self_talk_thoughts (
  id TEXT PRIMARY KEY NOT NULL,
  text TEXT NOT NULL,
  preset_id TEXT,
  source TEXT NOT NULL DEFAULT 'added',
  created_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE session_artifacts (
  session_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (session_id, kind)
);

CREATE TABLE session_steps (
  session_id TEXT NOT NULL,
  step TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (session_id, step)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  prompt_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  video_path TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  transcription_source TEXT NOT NULL DEFAULT 'gemini',
  transcript_verbatim TEXT,
  transcript_clean TEXT,
  status TEXT NOT NULL DEFAULT 'recording',
  wants_grading INTEGER NOT NULL DEFAULT 1,
  filler_word_count INTEGER,
  filler_rate_per_minute REAL,
  video_deleted_at TEXT,
  deleted_at TEXT,
  session_type TEXT NOT NULL DEFAULT 'spontaneous',
  script_id TEXT,
  cues_enabled INTEGER,
  plan_point_text TEXT,
  plan_reason_text TEXT,
  plan_example_text TEXT,
  transcript_words_json TEXT,
  wpm_curve_json TEXT,
  repeated_word_count INTEGER,
  dsp_status TEXT,
  pitch_contour_json TEXT,
  volume_envelope_json TEXT,
  gemini_file_name TEXT,
  gemini_file_uri TEXT,
  gemini_file_uploaded_at TEXT,
  video_file TEXT,
  last_error TEXT,
  updated_at TEXT,
  subject_json TEXT,
  video_keepsake INTEGER NOT NULL DEFAULT 0,
  video_compressed_at TEXT,
  session_score REAL,
  pitch_median_hz REAL,
  pitch_range_st REAL,
  pitch_sd_st REAL,
  loudness_spread_db REAL,
  loudness_peak_sd_db REAL
);

CREATE TABLE skill_checks (
  id TEXT PRIMARY KEY NOT NULL,
  taken_at TEXT NOT NULL,
  topic_id TEXT,
  session_id TEXT,
  pieces_json TEXT NOT NULL DEFAULT '{}',
  results_json TEXT,
  felt INTEGER,
  retake_of TEXT
);

CREATE TABLE skill_events (
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

CREATE TABLE skill_mastery (
  skill TEXT PRIMARY KEY NOT NULL,
  rating REAL NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_practiced_at TEXT,
  stage INTEGER NOT NULL DEFAULT 1,
  stage_reached_at TEXT
);

CREATE TABLE social_events (
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
  completed_at TEXT,
  deleted_at TEXT
);

CREATE TABLE speaking_events (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  title TEXT,
  event_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  deleted_at TEXT,
  after_went INTEGER,
  after_focus_result TEXT
);

CREATE INDEX idx_day_recalls_date ON day_recalls(date);

CREATE INDEX idx_drill_attempts_started ON drill_attempts(started_at);

CREATE INDEX idx_saved_phrases_created ON saved_phrases(created_at);

CREATE INDEX idx_self_likes_date ON self_likes(date);

CREATE INDEX idx_self_talk_challenges_thought ON self_talk_challenges(thought_id, created_at);

CREATE UNIQUE INDEX idx_self_talk_thoughts_preset ON self_talk_thoughts(preset_id) WHERE preset_id IS NOT NULL AND archived_at IS NULL;

CREATE INDEX idx_session_steps_status ON session_steps(status);

CREATE INDEX idx_skill_events_skill ON skill_events(skill, at);

CREATE INDEX idx_social_events_created ON social_events(created_at);

CREATE INDEX idx_speaking_events_date ON speaking_events(event_date);
`;

interface SchemaStep {
  version: number;
  description: string;
  sql: string;
}

const STEPS: SchemaStep[] = [
  {
    version: 38,
    description: "the activity log (task 2.2); plan check-offs become queries over it, so the plans stop storing them",
    sql: `
      CREATE TABLE activity_log (
        id TEXT PRIMARY KEY NOT NULL,
        activity_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        variant TEXT,
        outcome TEXT NOT NULL DEFAULT 'done',
        at TEXT NOT NULL,
        local_date TEXT NOT NULL,
        score REAL,
        session_id TEXT,
        plan_date TEXT,
        plan_slot INTEGER,
        plan_step_id TEXT,
        lesson_id TEXT,
        lesson_step_index INTEGER
      );
      CREATE INDEX idx_activity_log_date ON activity_log(local_date, activity_id);
      CREATE INDEX idx_activity_log_lesson ON activity_log(lesson_id, lesson_step_index);
      CREATE INDEX idx_activity_log_session ON activity_log(session_id) WHERE session_id IS NOT NULL;
      ALTER TABLE daily_plans DROP COLUMN completed_steps_json;
      ALTER TABLE daily_topups DROP COLUMN completed_steps_json;
    `,
  },
  {
    version: 39,
    description: "the skill tree's stored numbers (tasks 3a.3, 3a.4): leaf ratings, what moved them, stages and the level replace the five skill ratings",
    sql: `
      CREATE TABLE leaf_ratings (
        leaf_id TEXT PRIMARY KEY NOT NULL,
        rating REAL NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_moved_at TEXT
      );
      CREATE TABLE score_attempts (
        id TEXT PRIMARY KEY NOT NULL,
        at TEXT NOT NULL,
        activity_id TEXT,
        kind TEXT NOT NULL,
        label TEXT NOT NULL,
        score REAL,
        difficulty REAL,
        source TEXT,
        session_id TEXT,
        drill_type TEXT,
        nodes_json TEXT NOT NULL
      );
      CREATE TABLE leaf_events (
        attempt_id TEXT NOT NULL,
        leaf_id TEXT NOT NULL,
        skill_id TEXT NOT NULL,
        pillar_id TEXT NOT NULL,
        at TEXT NOT NULL,
        rating_before REAL NOT NULL,
        rating_after REAL NOT NULL,
        score REAL,
        weight REAL,
        difficulty REAL,
        source TEXT,
        session_id TEXT,
        PRIMARY KEY (attempt_id, leaf_id)
      );
      CREATE TABLE node_stages (
        node_id TEXT PRIMARY KEY NOT NULL,
        stage INTEGER NOT NULL,
        reached_at TEXT
      );
      CREATE TABLE speaker_level (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        level INTEGER NOT NULL,
        reached_at TEXT
      );
      CREATE INDEX idx_score_attempts_at ON score_attempts(at);
      CREATE INDEX idx_score_attempts_session ON score_attempts(session_id) WHERE session_id IS NOT NULL;
      CREATE INDEX idx_leaf_events_leaf ON leaf_events(leaf_id);
      CREATE INDEX idx_leaf_events_skill ON leaf_events(skill_id);
      CREATE INDEX idx_leaf_events_pillar ON leaf_events(pillar_id);
      CREATE INDEX idx_leaf_events_session ON leaf_events(session_id) WHERE session_id IS NOT NULL;
      DROP TABLE skill_events;
      DROP TABLE skill_mastery;
      ALTER TABLE sessions ADD COLUMN pitch_phrase_sd_st REAL;
    `,
  },
  {
    version: 40,
    description: "personal activities move the tree (task 3c.4): an attempt can name what it was (a Rewind, a day of Three things), so it counts once",
    sql: `
      ALTER TABLE score_attempts ADD COLUMN ref TEXT;
      CREATE UNIQUE INDEX idx_score_attempts_ref ON score_attempts(ref) WHERE ref IS NOT NULL;
    `,
  },
];

export const SCHEMA_VERSION = STEPS[STEPS.length - 1].version;

export interface SchemaResult {
  // True when the database held a pre-2.0 schema and was emptied to build the
  // new one. The caller clears the files and settings that went with it.
  wipedOldData: boolean;
}

// transaction lets the caller queue the work behind other transactions (see
// inTransaction in database.ts); by default it runs directly.
// rebuild: drop everything and build the current schema, whatever the version
// (Reset app), in the same transaction, so a failure leaves the database as it was.
export async function ensureSchema(
  db: SQLiteDatabase,
  transaction: (task: () => Promise<void>) => Promise<void> = (task) => db.withTransactionAsync(task),
  options: { rebuild?: boolean } = {},
): Promise<SchemaResult> {
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const version = options.rebuild ? 0 : row?.user_version ?? 0;

  if (version === SCHEMA_VERSION) return { wipedOldData: false };
  if (version >= BASELINE_VERSION && version < SCHEMA_VERSION) {
    // Built by this version of the app earlier: add what it hasn't had.
    await transaction(async () => {
      for (const step of STEPS.filter((x) => x.version > version)) {
        logger.info(`[db] schema step ${step.version}: ${step.description}`);
        await db.execAsync(step.sql);
        await db.execAsync(`PRAGMA user_version = ${step.version};`);
      }
    });
    return { wipedOldData: false };
  }
  if (version > SCHEMA_VERSION) {
    // Made by a newer build (a downgrade). Leave it alone rather than guess.
    logger.warn(`[db] schema version ${version} is newer than this build's ${SCHEMA_VERSION}; leaving it as it is`);
    return { wipedOldData: false };
  }

  const tables = await db.getAllAsync<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`);
  const hadOldData = tables.length > 0;
  if (hadOldData) logger.info(`[db] schema version ${version} is from before 2.0.0 — wiping ${tables.length} tables`);

  // Foreign keys would block dropping a parent table before its children, and
  // the setting can't change inside a transaction. It goes back on after.
  const fk = await db.getFirstAsync<{ foreign_keys: number }>("PRAGMA foreign_keys");
  await db.execAsync("PRAGMA foreign_keys = OFF;");
  try {
    await transaction(async () => {
      for (const { name } of tables) await db.execAsync(`DROP TABLE IF EXISTS "${name}";`);
      await db.execAsync(SCHEMA_SQL);
      for (const step of STEPS) await db.execAsync(step.sql);
      await seed(db);
      // Set inside the transaction with everything else: a failure part way
      // rolls it all back, drops included, and the next launch tries again.
      await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
    });
  } finally {
    if (fk?.foreign_keys) await db.execAsync("PRAGMA foreign_keys = ON;");
  }
  return { wipedOldData: hadOldData };
}

// What a new database starts with: the built-in prompts (sessions point at
// them by id) and the starting difficulty of the Impromptu rep.
async function seed(db: SQLiteDatabase): Promise<void> {
  const now = new Date().toISOString();
  for (const topic of TOPICS) {
    const tier = DIFFICULTY_OVERRIDES[topic.id] ?? defaultDifficultyTier(topic.category, topic.text);
    await db.runAsync(
      `INSERT OR IGNORE INTO prompts (id, category, text, difficulty_tier, is_user_created, created_at, deleted_at)
       VALUES (?, ?, ?, ?, 0, ?, NULL)`,
      [topic.id, topic.category, topic.text, tier, now],
    );
  }
  await db.runAsync(`INSERT OR IGNORE INTO drill_difficulty (drill_type, level, attempts, successes, updated_at) VALUES ('rep', 1, 0, 0, ?)`, [now]);
}
