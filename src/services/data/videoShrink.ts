import { getDatabase } from "../db/database";
import { isSessionLive } from "../db/sessionsRepo";
import { resolveVideoUri, videoExists } from "../storage/videoStorage";
import { compressInPlace, PLAYBACK_PROFILE } from "../storage/videoTranscode";
import { freeDiskBytes } from "../storage/diskSpace";
import { KEEPSAKE_MIN_FREE } from "../../domain/storage";
import { logger } from "../../utils/logger";

// Decided 2026-10-23 (session 06): once a take has been analysed, its stored
// 1080p video (about 115 MB a minute) is replaced by a 720p playback copy at
// about 2 Mb/s (about 15 MB a minute). The audio track comes along, so voice
// analysis can still be re-run, and 720p at 30 fps is enough to re-run face
// analysis later. Measurements are already in the feature track by then.
//
// "Analysed" = not deleted or in a delete's undo window, every step settled
// (none pending, running or interrupted), and
// the take at least SETTLE_MS old, so the Result screen you're looking at
// right after recording still plays the original. Runs at launch and a while
// after a pipeline run finishes; one take at a time, never twice at once.

const SETTLE_MS = 10 * 60 * 1000;
const PER_RUN = 5;

let running: Promise<void> | null = null;

interface Row {
  id: string;
  video_file: string | null;
  video_path: string;
}

export function shrinkAnalysedVideos(): Promise<void> {
  running ??= run().finally(() => {
    running = null;
  });
  return running;
}

async function run(): Promise<void> {
  try {
    const db = await getDatabase();
    const cutoff = new Date(Date.now() - SETTLE_MS).toISOString();
    const rows = await db.getAllAsync<Row>(
      `SELECT s.id, s.video_file, s.video_path FROM sessions s
       WHERE s.deleted_at IS NULL AND s.video_deleted_at IS NULL AND s.video_compressed_at IS NULL
         AND s.status IN ('done', 'error') AND s.recorded_at < ?
         AND NOT EXISTS (SELECT 1 FROM session_steps st WHERE st.session_id = s.id AND st.status IN ('pending', 'running', 'interrupted'))
       ORDER BY s.recorded_at DESC LIMIT ?`,
      [cutoff, PER_RUN],
    );
    for (const row of rows) {
      // Re-encoding writes a second copy before the swap.
      const free = freeDiskBytes();
      if (free != null && free < KEEPSAKE_MIN_FREE) {
        logger.info("[video] low on space, shrinking waits for another time");
        return;
      }
      // Deleted since the query (an undo window started): leave its file to
      // the delete. Re-checked here because each re-encode takes a while.
      if (!(await isSessionLive(row.id))) continue;
      const uri = resolveVideoUri({ videoFile: row.video_file, videoPath: row.video_path });
      if (!videoExists(uri)) continue;
      try {
        await compressInPlace(uri, PLAYBACK_PROFILE);
      } catch (error) {
        logger.warn(`[video] couldn't shrink ${row.id}: ${(error as Error).message}`);
      }
      // Marked either way: a take that came out no smaller (or can't be
      // re-encoded) isn't retried at every launch.
      await db.runAsync(`UPDATE sessions SET video_compressed_at = ? WHERE id = ?`, [new Date().toISOString(), row.id]);
    }
  } catch (error) {
    logger.error(`[video] shrink failed — ${(error as Error).message}`);
  }
}

// After a take's pipeline settles: try again once it's old enough. Best
// effort (a timer doesn't run while the app is suspended); launch catches
// anything missed.
export function scheduleShrink(): void {
  setTimeout(() => {
    shrinkAnalysedVideos().catch(() => undefined);
  }, SETTLE_MS + 5000);
}
