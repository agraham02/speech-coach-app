import * as SQLite from "expo-sqlite";
import { ensureSchema } from "./schema";

const DB_NAME = "speech_coach.db";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// Set when opening the database found one from before 2.0.0 and emptied it.
// Whoever clears the rest of the old data (files, settings) takes it once:
// see takeOldDataWipe.
let oldDataWiped = false;

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    const opening = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      const result = await ensureSchema(db);
      if (result.wipedOldData) oldDataWiped = true;
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

// One transaction at a time. expo-sqlite's withTransactionAsync is not
// exclusive: two callers at once (the launch reconcile and the path sync, say)
// each send BEGIN on the one connection, and the second fails with "cannot
// start a transaction within a transaction", whose own ROLLBACK then fails
// with "no transaction is active". Every transaction outside the migrations
// goes through here, so they queue instead. Do not call it from inside a
// transaction's own callback (it would wait for itself).
let transactions: Promise<unknown> = Promise.resolve();

export function inTransaction(db: Pick<SQLite.SQLiteDatabase, "withTransactionAsync">, task: () => Promise<void>): Promise<void> {
  const run = transactions.then(() => db.withTransactionAsync(task));
  // A failed transaction must not block the ones queued behind it.
  transactions = run.catch(() => undefined);
  return run;
}

// True once if opening the database wiped a pre-2.0 one, then false until it
// happens again. Waits for the database to open first.
export async function takeOldDataWipe(): Promise<boolean> {
  await getDatabase();
  const wiped = oldDataWiped;
  oldDataWiped = false;
  return wiped;
}

// Empties the database back to a fresh install (Reset app): the schema
// version goes back to 0, so the schema code drops every table and builds the
// current schema again (it also seeds the built-in prompts). Done in place
// rather than deleting the file, which fails while any other connection —
// even a stale one from a dev reload — still has it open.
export async function wipeDatabase(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync("PRAGMA user_version = 0;");
  // Through the queue, like every other transaction (see inTransaction).
  await ensureSchema(db, (task) => inTransaction(db, task));
  // Give the freed pages back to the file system.
  await db.execAsync("VACUUM;");
}
