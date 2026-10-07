import { Share } from "react-native";
import { File, Paths } from "expo-file-system";
import { getDatabase } from "../db/database";
import { deleteSessionVideo } from "../db/sessionsRepo";
import { deleteRecording, listSessionFiles, resolveVideoUri } from "../storage/videoStorage";
import { logger } from "../../utils/logger";

// Everything this app knows lives on the phone. These helpers let you take
// a copy of it with you and keep storage in check.

const DB_NAME = "speech_coach.db";

// Copies the practice database (sessions, transcripts, scores, drills,
// mastery, lesson progress) to a dated file and opens the share sheet so it
// can be saved to Files, AirDropped, etc. Videos aren't included — they're
// large and are kept separately (see deleteOldVideos).
export async function exportPracticeData(): Promise<void> {
  const db = await getDatabase();
  // Flush the write-ahead log so the copied file is complete on its own.
  await db.execAsync("PRAGMA wal_checkpoint(TRUNCATE)");
  // expo-sqlite keeps databases in <documents>/SQLite on iOS and Android.
  // (Its `defaultDatabaseDirectory` is a bare path, not a file:// URI, so
  // it can't be handed to File directly.)
  const source = new File(Paths.document, "SQLite", DB_NAME);
  if (!source.exists) throw new Error("Couldn't find the practice database to export.");
  const stamp = new Date().toISOString().slice(0, 10);
  const copy = new File(Paths.cache, `speech-coach-${stamp}.db`);
  if (copy.exists) copy.delete();
  await source.copy(copy);
  const bytes = new File(copy.uri).size ?? 0;
  if (bytes === 0) throw new Error("The database copy came out empty.");
  logger.info(`[data] exported database (${Math.round(bytes / 1024)} KB)`);
  await Share.share({ url: copy.uri, title: "Speech Coach data" });
}

export function getVideoStorageBytes(): number {
  return listSessionFiles().reduce((sum, f) => {
    try {
      return sum + (new File(f.uri).size ?? 0);
    } catch {
      return sum;
    }
  }, 0);
}

// Deletes video files for sessions older than `days`, keeping their
// transcripts, analysis and scores. Returns how many videos were removed.
export async function deleteOldVideos(days: number): Promise<number> {
  const db = await getDatabase();
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = await db.getAllAsync<{ id: string; video_file: string | null; video_path: string }>(
    `SELECT id, video_file, video_path FROM sessions WHERE video_deleted_at IS NULL AND recorded_at < ?`,
    [cutoff],
  );
  for (const row of rows) {
    deleteRecording(resolveVideoUri({ videoFile: row.video_file, videoPath: row.video_path }));
    await deleteSessionVideo(row.id);
  }
  logger.info(`[data] deleted ${rows.length} video(s) older than ${days} days`);
  return rows.length;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
