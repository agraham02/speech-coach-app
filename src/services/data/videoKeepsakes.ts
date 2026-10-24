import { getLastAutoCleanup, getVideoRetentionDays, setLastAutoCleanup } from "../prefs/prefsStore";
import { todayISODate } from "../../utils/dateUtils";
import { compressInPlace, KEEPSAKE_PROFILE } from "../storage/videoTranscode";
import { getDatabase } from "../db/database";
import { resolveVideoUri } from "../storage/videoStorage";
import { freeUpSessionVideo } from "./takeDeletion";
import { planVideoCleanup, type VideoCandidate } from "../../domain/videoKeepsakes";
import type { SessionType } from "../../domain/sessionTypes";
import { logger } from "../../utils/logger";
import { KEEPSAKE_MIN_FREE } from "../../domain/storage";
import { freeDiskBytes } from "../storage/diskSpace";

// Keepsakes are for rewatching, not for a deep review, so they're stored at
// 720p and a modest bitrate — roughly 10 MB a minute (KEEPSAKE_PROFILE). A take
// already shrunk after analysis (services/data/videoShrink.ts) is left as it is.

interface VideoRow {
  id: string;
  recorded_at: string;
  session_type: string;
  duration_seconds: number;
  score: number | null;
  video_keepsake: number;
  video_compressed_at: string | null;
  video_file: string | null;
  video_path: string;
  gemini_file_name: string | null;
}

async function getVideoRows(): Promise<VideoRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<VideoRow>(
    `SELECT s.id, s.recorded_at, s.session_type, s.duration_seconds, COALESCE(s.session_score, sc.overall_score) AS score,
            s.video_keepsake, s.video_compressed_at, s.video_file, s.video_path, s.gemini_file_name
     FROM sessions s LEFT JOIN scores sc ON sc.session_id = s.id
     WHERE s.deleted_at IS NULL AND s.video_deleted_at IS NULL`,
  );
}

// Frees the space of videos older than `days` (transcripts and scores stay;
// this is not deleting the takes), keeping one per month as a compressed
// progress keepsake. Compression runs in the background afterwards.
export async function deleteOldVideos(days: number): Promise<{ deleted: number; kept: number }> {
  const db = await getDatabase();
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = await getVideoRows();
  const candidates: VideoCandidate[] = rows.map((r) => ({
    id: r.id,
    recordedAt: r.recorded_at,
    sessionType: r.session_type as SessionType,
    durationSeconds: r.duration_seconds,
    score: r.score,
    keepsake: r.video_keepsake === 1,
  }));
  const plan = planVideoCleanup(candidates, cutoff);
  const byId = new Map(rows.map((r) => [r.id, r]));

  for (const id of plan.keep) {
    await db.runAsync(`UPDATE sessions SET video_keepsake = 1 WHERE id = ?`, [id]);
  }
  for (const id of plan.delete) {
    const row = byId.get(id)!;
    // The space-saving kind of delete: the transcript and numbers stay.
    await freeUpSessionVideo({ id, videoFile: row.video_file, videoPath: row.video_path, geminiFileName: row.gemini_file_name });
  }
  logger.info(`[data] cleared ${plan.delete.length} video(s) older than ${days} days, kept ${plan.keep.length} new keepsake(s)`);

  compressExpiredKeepsakes(cutoff).catch((error) => logger.error(`[keepsake] compression failed — ${(error as Error).message}`));
  const keptTotal = rows.filter((r) => r.video_keepsake === 1).length + plan.keep.length;
  return { deleted: plan.delete.length, kept: keptTotal };
}

// Only keepsakes past the cutoff are compressed: a recent pinned take stays
// full quality so a deep review of it still works.
async function compressExpiredKeepsakes(cutoffIso: string): Promise<void> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<VideoRow>(
    `SELECT id, recorded_at, session_type, duration_seconds, NULL AS score, video_keepsake, video_compressed_at, video_file, video_path, gemini_file_name
     FROM sessions
     WHERE deleted_at IS NULL AND video_deleted_at IS NULL AND video_keepsake = 1 AND video_compressed_at IS NULL AND recorded_at < ?`,
    [cutoffIso],
  );
  for (const row of rows) {
    // Re-encoding writes a second copy before the swap.
    const free = freeDiskBytes();
    if (free != null && free < KEEPSAKE_MIN_FREE) {
      logger.info("[keepsake] low on space, compression waits for another day");
      return;
    }
    const uri = resolveVideoUri({ videoFile: row.video_file, videoPath: row.video_path });
    await compressInPlace(uri, KEEPSAKE_PROFILE);
    await db.runAsync(`UPDATE sessions SET video_compressed_at = ? WHERE id = ?`, [new Date().toISOString(), row.id]);
  }
}

export async function setVideoKeepsake(sessionId: string, keep: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE sessions SET video_keepsake = ? WHERE id = ?`, [keep ? 1 : 0, sessionId]);
}

// Runs the cleanup on its own, at most once a day, when you chose how long
// to keep videos during onboarding (0 = forever, unset = only on request).
export async function autoCleanupVideos(): Promise<void> {
  const days = getVideoRetentionDays();
  const today = todayISODate();
  if (!days || getLastAutoCleanup() === today) return;
  const { deleted } = await deleteOldVideos(days);
  // Only once it worked: a failed run tries again next launch.
  setLastAutoCleanup(today);
  if (deleted) logger.info(`[videos] auto-cleanup removed ${deleted} video(s) older than ${days} days`);
}
