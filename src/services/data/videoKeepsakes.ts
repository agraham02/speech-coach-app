import { File } from "expo-file-system";
import { Video } from "react-native-compressor";
import { getDatabase } from "../db/database";
import { deleteSessionVideo } from "../db/sessionsRepo";
import { deleteRecording, resolveVideoUri } from "../storage/videoStorage";
import { planVideoCleanup, type VideoCandidate } from "../../domain/videoKeepsakes";
import type { SessionType } from "../../domain/sessionTypes";
import { logger } from "../../utils/logger";

// Keepsakes are for rewatching, not for a deep review, so they're stored at
// 720p and a modest bitrate — roughly 10 MB a minute instead of 60+.
const KEEPSAKE_MAX_SIZE = 720;
const KEEPSAKE_BITRATE = 1_500_000;

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
}

async function getVideoRows(): Promise<VideoRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<VideoRow>(
    `SELECT s.id, s.recorded_at, s.session_type, s.duration_seconds, COALESCE(s.session_score, sc.overall_score) AS score,
            s.video_keepsake, s.video_compressed_at, s.video_file, s.video_path
     FROM sessions s LEFT JOIN scores sc ON sc.session_id = s.id
     WHERE s.deleted_at IS NULL AND s.video_deleted_at IS NULL`,
  );
}

// Clears videos older than `days`, keeping one per month as a compressed
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
    deleteRecording(resolveVideoUri({ videoFile: row.video_file, videoPath: row.video_path }));
    await deleteSessionVideo(id);
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
    `SELECT id, recorded_at, session_type, duration_seconds, NULL AS score, video_keepsake, video_compressed_at, video_file, video_path
     FROM sessions
     WHERE deleted_at IS NULL AND video_deleted_at IS NULL AND video_keepsake = 1 AND video_compressed_at IS NULL AND recorded_at < ?`,
    [cutoffIso],
  );
  for (const row of rows) {
    const uri = resolveVideoUri({ videoFile: row.video_file, videoPath: row.video_path });
    await compressInPlace(uri);
    await db.runAsync(`UPDATE sessions SET video_compressed_at = ? WHERE id = ?`, [new Date().toISOString(), row.id]);
  }
}

// Replaces the file with a compressed copy — only if it actually came out
// smaller (a short or already-small take can grow when re-encoded).
async function compressInPlace(uri: string): Promise<void> {
  const original = new File(uri);
  if (!original.exists) return;
  const before = original.size ?? 0;
  const resultUri = await Video.compress(uri, { compressionMethod: "manual", maxSize: KEEPSAKE_MAX_SIZE, bitrate: KEEPSAKE_BITRATE });
  const compressed = new File(resultUri.startsWith("file://") ? resultUri : `file://${resultUri}`);
  const after = compressed.exists ? (compressed.size ?? 0) : 0;
  if (after > 0 && after < before) {
    // Swap via a backup so a failure midway never loses the take. (A stray
    // backup is unreferenced, so launch cleanup removes it.)
    const backup = new File(`${uri}.bak`);
    if (backup.exists) backup.delete();
    original.moveSync(backup);
    try {
      compressed.moveSync(new File(uri));
      backup.delete();
      logger.info(`[keepsake] compressed ${Math.round(before / 1048576)} MB → ${Math.round(after / 1048576)} MB`);
    } catch (error) {
      backup.moveSync(new File(uri));
      throw error;
    }
  } else if (compressed.exists) {
    compressed.delete();
  }
}

export async function setVideoKeepsake(sessionId: string, keep: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE sessions SET video_keepsake = ? WHERE id = ?`, [keep ? 1 : 0, sessionId]);
}
