import { getDatabase } from "../db/database";
import { PURGE_AFTER_DAYS, VACUUM_FREE_BYTES } from "../../domain/storage";
import { logger } from "../../utils/logger";

// Deleting a session, a Rewind or an event marks it deleted (so a screen
// that's open doesn't break) and every query skips it. This removes those
// rows for good once they've been deleted a while, then gives the space back
// when enough has piled up. Rating history (skill_events) is kept: it's
// what moved a skill, not the take itself. Runs on launch.

const SESSION_CHILDREN = ["scores", "session_steps", "session_artifacts", "review_passes"];

export async function purgeDeletedData(now = new Date()): Promise<void> {
  const db = await getDatabase();
  const cutoff = new Date(now.getTime() - PURGE_AFTER_DAYS * 86_400_000).toISOString();
  let removed = 0;
  await db.withTransactionAsync(async () => {
    const old = `SELECT id FROM sessions WHERE deleted_at IS NOT NULL AND deleted_at < ?`;
    for (const table of SESSION_CHILDREN) await db.runAsync(`DELETE FROM ${table} WHERE session_id IN (${old})`, [cutoff]);
    removed += (await db.runAsync(`DELETE FROM sessions WHERE deleted_at IS NOT NULL AND deleted_at < ?`, [cutoff])).changes;
    for (const table of ["day_recalls", "speaking_events", "social_events"]) {
      removed += (await db.runAsync(`DELETE FROM ${table} WHERE deleted_at IS NOT NULL AND deleted_at < ?`, [cutoff])).changes;
    }
  });
  if (removed) logger.info(`[purge] removed ${removed} row(s) deleted over ${PURGE_AFTER_DAYS} days ago`);

  const pages = await db.getFirstAsync<{ freelist_count: number }>("PRAGMA freelist_count");
  const size = await db.getFirstAsync<{ page_size: number }>("PRAGMA page_size");
  const free = (pages?.freelist_count ?? 0) * (size?.page_size ?? 4096);
  if (free >= VACUUM_FREE_BYTES) {
    await db.execAsync("VACUUM;");
    logger.info(`[purge] compacted the database, ${Math.round(free / 1_000_000)} MB freed`);
  }
}
