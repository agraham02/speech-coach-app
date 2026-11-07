import { createTestDatabase, sqliteAvailable } from "./sqliteTestDb";

// The 2.0.0 schema against a real SQLite database: a fresh install, a
// database left by a 1.x build (wiped, once), and one the app built itself
// (left alone). Everything here is made up.

jest.mock("../../../utils/logger", () => ({ logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined } }));

import { ensureSchema, SCHEMA_VERSION } from "../schema";
import { TOPICS } from "../../../data/topics";

const describeIfSqlite = sqliteAvailable() ? describe : describe.skip;

type Db = ReturnType<typeof createTestDatabase>;

async function version(db: Db): Promise<number> {
  return (await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version"))?.user_version ?? -1;
}

async function tableNames(db: Db): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`);
  return rows.map((r) => r.name);
}

// What a 1.x database looks like to the new code: an old version number,
// tables the new schema also has (with a row of someone's data in one) and
// one table it no longer has.
function oldDatabase(oldVersion: number): Db {
  const db = createTestDatabase();
  db.raw.exec(`
    CREATE TABLE sessions (id TEXT PRIMARY KEY NOT NULL, prompt_id TEXT NOT NULL);
    CREATE TABLE scores (session_id TEXT PRIMARY KEY NOT NULL REFERENCES sessions(id), overall_score INTEGER NOT NULL);
    CREATE TABLE removed_in_two (id TEXT PRIMARY KEY NOT NULL);
    INSERT INTO sessions VALUES ('s1', 't001');
    INSERT INTO scores VALUES ('s1', 7);
    INSERT INTO removed_in_two VALUES ('x');
    PRAGMA user_version = ${oldVersion};
  `);
  return db;
}

describeIfSqlite("the 2.0.0 schema", () => {
  it("builds a fresh install without calling it a wipe", async () => {
    const db = createTestDatabase();
    expect(await ensureSchema(db as never)).toEqual({ wipedOldData: false });
    expect(await version(db)).toBe(SCHEMA_VERSION);
    expect(await tableNames(db)).toEqual(expect.arrayContaining(["sessions", "scores", "skill_mastery", "lesson_progress", "daily_plans", "path_units", "speaking_events", "day_recalls", "prompts"]));
  });

  it("starts after 1.x's last version, so every 1.x database is old", () => {
    expect(SCHEMA_VERSION).toBeGreaterThan(36);
  });

  it("seeds the built-in prompts and the Impromptu rep's starting difficulty", async () => {
    const db = createTestDatabase();
    await ensureSchema(db as never);
    const prompts = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM prompts WHERE is_user_created = 0");
    expect(prompts?.n).toBe(TOPICS.length);
    expect(await db.getFirstAsync("SELECT level, attempts FROM drill_difficulty WHERE drill_type = 'rep'")).toEqual({ level: 1, attempts: 0 });
  });

  it.each([1, 20, 36])("wipes a version %i database, tables and rows, and says so", async (old) => {
    const db = oldDatabase(old);
    expect(await ensureSchema(db as never)).toEqual({ wipedOldData: true });
    expect(await version(db)).toBe(SCHEMA_VERSION);
    expect(await tableNames(db)).not.toContain("removed_in_two");
    expect(await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM sessions")).toEqual({ n: 0 });
    expect(await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM scores")).toEqual({ n: 0 });
  });

  it("wipes with foreign keys on, and turns them back on", async () => {
    const db = oldDatabase(30);
    db.raw.exec("PRAGMA foreign_keys = ON;");
    await ensureSchema(db as never);
    expect(await db.getFirstAsync("PRAGMA foreign_keys")).toEqual({ foreign_keys: 1 });
  });

  it("treats a version 0 database that has tables as old data (a first install that stopped half way)", async () => {
    const db = oldDatabase(0);
    expect(await ensureSchema(db as never)).toEqual({ wipedOldData: true });
    expect(await tableNames(db)).not.toContain("removed_in_two");
  });

  it("leaves a database it already built alone, with the person's rows", async () => {
    const db = createTestDatabase();
    await ensureSchema(db as never);
    await db.runAsync("INSERT INTO confidence_checkins (date, rating) VALUES ('2026-11-06', 4)");
    expect(await ensureSchema(db as never)).toEqual({ wipedOldData: false });
    expect(await db.getFirstAsync("SELECT rating FROM confidence_checkins")).toEqual({ rating: 4 });
  });

  it("leaves a database from a newer build alone", async () => {
    const db = oldDatabase(SCHEMA_VERSION + 5);
    expect(await ensureSchema(db as never)).toEqual({ wipedOldData: false });
    expect(await version(db)).toBe(SCHEMA_VERSION + 5);
    expect(await tableNames(db)).toContain("removed_in_two");
  });

  it("rebuilds from the start when asked to by resetting the version (Reset app)", async () => {
    const db = createTestDatabase();
    await ensureSchema(db as never);
    await db.runAsync("INSERT INTO confidence_checkins (date, rating) VALUES ('2026-11-06', 4)");
    await ensureSchema(db as never, undefined, { rebuild: true });
    expect(await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM confidence_checkins")).toEqual({ n: 0 });
    expect(await version(db)).toBe(SCHEMA_VERSION);
  });

  it("adds the activity log to a database built at 37, and keeps its rows", async () => {
    const db = createTestDatabase();
    await ensureSchema(db as never);
    // Make it look like a 2.0 database from before the activity log.
    db.raw.exec(`
      DROP TABLE activity_log;
      ALTER TABLE daily_plans ADD COLUMN completed_steps_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE daily_topups ADD COLUMN completed_steps_json TEXT NOT NULL DEFAULT '[]';
      INSERT INTO daily_plans (date, plan_json, completed_steps_json) VALUES ('2026-11-06', '{}', '["0"]');
      INSERT INTO confidence_checkins (date, rating) VALUES ('2026-11-06', 4);
      PRAGMA user_version = 37;
    `);
    expect(await ensureSchema(db as never)).toEqual({ wipedOldData: false });
    expect(await version(db)).toBe(SCHEMA_VERSION);
    expect(await tableNames(db)).toContain("activity_log");
    expect(await db.getFirstAsync("SELECT rating FROM confidence_checkins")).toEqual({ rating: 4 });
    expect(await db.getFirstAsync<{ date: string }>("SELECT date FROM daily_plans")).toEqual({ date: "2026-11-06" });
    const columns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(daily_plans)");
    expect(columns.map((c) => c.name)).not.toContain("completed_steps_json");
  });

  it("builds the activity log on a fresh install, and the plans keep nothing about steps", async () => {
    const db = createTestDatabase();
    await ensureSchema(db as never);
    const log = await db.getAllAsync<{ name: string }>("PRAGMA table_info(activity_log)");
    expect(log.map((c) => c.name)).toEqual(
      expect.arrayContaining(["activity_id", "kind", "variant", "outcome", "at", "local_date", "score", "session_id", "plan_date", "plan_slot", "plan_step_id", "lesson_id", "lesson_step_index"]),
    );
    for (const table of ["daily_plans", "daily_topups"]) {
      expect((await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`)).map((c) => c.name)).not.toContain("completed_steps_json");
    }
  });

  it("rolls everything back if the build fails part way, so the next launch can try again", async () => {
    const db = oldDatabase(20);
    const failing = Object.create(db) as Db;
    failing.runAsync = async () => {
      throw new Error("disk full");
    };
    await expect(ensureSchema(failing as never)).rejects.toThrow("disk full");
    // Back as it was: old tables and rows, old version, foreign keys unchanged.
    expect(await version(db)).toBe(20);
    expect(await tableNames(db)).toEqual(["removed_in_two", "scores", "sessions"]);
    expect(await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM sessions")).toEqual({ n: 1 });
    // And the retry works.
    expect(await ensureSchema(db as never)).toEqual({ wipedOldData: true });
  });
});
