import { AppState } from "react-native";
import { getDatabase } from "../db/database";
import { VACUUM_FREE_BYTES } from "../../domain/storage";
import { finishPendingDeletes } from "./takeDeletion";
import { logger } from "../../utils/logger";

// Deleted means gone. A delete hides what you deleted at once (deleted_at) and
// leaves a short window to undo it; this finishes the job. Takes (recordings
// and Rewinds) are erased by takeDeletion.ts, with their files and every row
// about them. The rest of what you can delete (events, conversation debriefs
// and blanked moments, marked texts, phrases, things you like about yourself)
// is plain text, and its rows are removed here. Runs on launch and whenever the
// app goes to the background, so nothing deleted survives either.

const OTHER_DELETABLE_TABLES = ["speaking_events", "social_events", "blank_moments", "marked_texts", "saved_phrases", "self_likes"];

export async function purgeDeletedData(options: { vacuum?: boolean } = {}): Promise<void> {
  const erased = await finishPendingDeletes();

  const db = await getDatabase();
  let removed = 0;
  await db.withTransactionAsync(async () => {
    for (const table of OTHER_DELETABLE_TABLES) {
      removed += (await db.runAsync(`DELETE FROM ${table} WHERE deleted_at IS NOT NULL`)).changes;
    }
  });
  if (erased || removed) logger.info(`[purge] erased ${erased} take(s) and ${removed} other deleted row(s)`);

  if (options.vacuum === false) return;
  // Hand the space back once enough has piled up (deleted rows leave free pages).
  const pages = await db.getFirstAsync<{ freelist_count: number }>("PRAGMA freelist_count");
  const size = await db.getFirstAsync<{ page_size: number }>("PRAGMA page_size");
  const free = (pages?.freelist_count ?? 0) * (size?.page_size ?? 4096);
  if (free >= VACUUM_FREE_BYTES) {
    await db.execAsync("VACUUM;");
    logger.info(`[purge] compacted the database, ${Math.round(free / 1_000_000)} MB freed`);
  }
}

// Finishes any pending delete as the app leaves the screen, so an undo window
// never outlives the app being open. Returns the unsubscribe.
export function purgeWhenBackgrounded(): () => void {
  const subscription = AppState.addEventListener("change", (state) => {
    if (state === "background") {
      purgeDeletedData({ vacuum: false }).catch((error) => logger.warn(`[purge] background purge failed - ${(error as Error).message}`));
    }
  });
  return () => subscription.remove();
}
