import * as SQLite from "expo-sqlite";
import { runMigrations } from "./migrations";

const DB_NAME = "speech_coach.db";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    const opening = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await runMigrations(db);
      return db;
    })();
    // Don't cache a failure: a rejected open/migration would otherwise
    // poison every later query until the app restarts.
    opening.catch(() => {
      if (dbPromise === opening) dbPromise = null;
    });
    dbPromise = opening;
  }
  return dbPromise;
}

// Empties the database back to a fresh install (Reset app): every table is
// dropped, the schema version goes back to 0, and the migrations run again
// (they also seed the built-in prompts and starting ratings). Done in place
// rather than deleting the file, which fails while any other connection —
// even a stale one from a dev reload — still has it open.
export async function wipeDatabase(): Promise<void> {
  const db = await getDatabase();
  const tables = await db.getAllAsync<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`);
  // Child rows (scores -> sessions) would block dropping a parent while
  // foreign keys are enforced; it can't change inside a transaction.
  const fk = await db.getFirstAsync<{ foreign_keys: number }>("PRAGMA foreign_keys");
  await db.execAsync("PRAGMA foreign_keys = OFF;");
  await db.withTransactionAsync(async () => {
    for (const { name } of tables) await db.execAsync(`DROP TABLE IF EXISTS "${name}";`);
    await db.execAsync("PRAGMA user_version = 0;");
  });
  if (fk?.foreign_keys) await db.execAsync("PRAGMA foreign_keys = ON;");
  await runMigrations(db);
  // Give the freed pages back to the file system.
  await db.execAsync("VACUUM;");
}
