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
