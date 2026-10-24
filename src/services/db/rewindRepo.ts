import { getDatabase } from "./database";
import { generateId } from "../../utils/generateId";
import { todayISODate } from "../../utils/dateUtils";
import { markPracticeDay } from "./practiceDaysRepo";
import type { RewindStats } from "../../domain/rewind/stats";
import type { RewindReview } from "../../domain/rewind/reviewPrompt";
import type { TranscriptWord } from "../../domain/sessionTypes";
import type { VolumeSample } from "../speech/liveSpeechSession";

// Rewind: the end-of-day spoken recall (domain/rewind). One row per take.

// What a Rewind still being processed keeps so it can start again if the app
// is closed first (cleared when it finishes): the recognizer's audio files in
// order, what it heard, the volume readings, and how many times it has been
// resumed (so a take that crashes the app can't loop).
export interface RewindPending {
  segments: string[];
  liveText: string;
  volume: VolumeSample[];
  durationMs: number;
  resumes: number;
}

export type RewindStatus = "processing" | "done" | "failed";
// Who wrote the notes, by name ("Tono AI", "OpenAI"), from the result's
// provenance. Null: no notes.
export type ReviewSource = string | null;

export interface Rewind {
  id: string;
  date: string; // local YYYY-MM-DD it was told
  recordedAt: string;
  audioFile: string | null;
  durationSeconds: number;
  transcript: string;
  transcriptSource: "whisper" | "live" | null;
  // Whisper's word timings (verbatim, fillers included) for follow-along
  // playback. Null when the live recognizer wrote the transcript.
  words: TranscriptWord[] | null;
  stats: RewindStats | null;
  review: RewindReview | null;
  reviewSource: ReviewSource;
  status: RewindStatus;
}

interface Row {
  id: string;
  date: string;
  recorded_at: string;
  audio_file: string | null;
  duration_seconds: number;
  transcript: string | null;
  transcript_source: string | null;
  words_json?: string | null;
  stats_json: string | null;
  review_json: string | null;
  review_source: string | null;
  status: string;
  pending_json?: string | null;
}

function parse<T>(json: string | null): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function fromRow(r: Row): Rewind {
  return {
    id: r.id,
    date: r.date,
    recordedAt: r.recorded_at,
    audioFile: r.audio_file,
    durationSeconds: r.duration_seconds,
    transcript: r.transcript ?? "",
    transcriptSource: r.transcript_source === "whisper" || r.transcript_source === "live" ? r.transcript_source : null,
    words: parse<TranscriptWord[]>(r.words_json ?? null),
    stats: parse<RewindStats>(r.stats_json),
    review: parse<RewindReview>(r.review_json),
    reviewSource: r.review_source || null,
    status: r.status === "done" || r.status === "failed" ? r.status : "processing",
  };
}

// Starts a take's row, before any of the slow work (joining audio, Whisper,
// the coach), so a take is never lost to a failure partway.
export async function createRewind(durationSeconds: number, pending?: RewindPending): Promise<Rewind> {
  const db = await getDatabase();
  const rewind: Rewind = {
    id: generateId(),
    date: todayISODate(),
    recordedAt: new Date().toISOString(),
    audioFile: null,
    durationSeconds: Math.round(durationSeconds),
    transcript: "",
    transcriptSource: null,
    words: null,
    stats: null,
    review: null,
    reviewSource: null,
    status: "processing",
  };
  await db.runAsync(`INSERT INTO day_recalls (id, date, recorded_at, duration_seconds, status, pending_json) VALUES (?, ?, ?, ?, 'processing', ?)`, [
    rewind.id,
    rewind.date,
    rewind.recordedAt,
    rewind.durationSeconds,
    pending ? JSON.stringify(pending) : null,
  ]);
  return rewind;
}

export async function updateRewind(
  id: string,
  patch: Partial<{
    audioFile: string | null;
    transcript: string;
    transcriptSource: "whisper" | "live";
    words: TranscriptWord[] | null;
    stats: RewindStats;
    review: RewindReview;
    reviewSource: string;
    status: RewindStatus;
  }>,
): Promise<void> {
  const db = await getDatabase();
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  const add = (column: string, value: string | number | null) => {
    sets.push(`${column} = ?`);
    values.push(value);
  };
  if ("audioFile" in patch) add("audio_file", patch.audioFile ?? null);
  if (patch.transcript !== undefined) add("transcript", patch.transcript);
  if (patch.transcriptSource) add("transcript_source", patch.transcriptSource);
  if ("words" in patch) add("words_json", patch.words?.length ? JSON.stringify(patch.words) : null);
  if (patch.stats) add("stats_json", JSON.stringify(patch.stats));
  if (patch.review) add("review_json", JSON.stringify(patch.review));
  if (patch.reviewSource) add("review_source", patch.reviewSource);
  if (patch.status) {
    add("status", patch.status);
    // Nothing left to start again once it has finished or failed.
    if (patch.status !== "processing") add("pending_json", null);
  }
  if (!sets.length) return;
  await db.runAsync(`UPDATE day_recalls SET ${sets.join(", ")} WHERE id = ?`, [...values, id]);
}

export async function getRewind(id: string): Promise<Rewind | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Row>(`SELECT * FROM day_recalls WHERE id = ? AND deleted_at IS NULL`, [id]);
  return row ? fromRow(row) : null;
}

// Newest first.
export async function listRewinds(): Promise<Rewind[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Row>(`SELECT * FROM day_recalls WHERE deleted_at IS NULL ORDER BY recorded_at DESC`);
  return rows.map(fromRow);
}

// Takes recorded before `cutoffIso` whose audio is still on the phone.
export async function listRewindAudioBefore(cutoffIso: string): Promise<{ id: string; audioFile: string }[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: string; audio_file: string }>(
    `SELECT id, audio_file FROM day_recalls WHERE audio_file IS NOT NULL AND deleted_at IS NULL AND recorded_at < ?`,
    [cutoffIso],
  );
  return rows.map((r) => ({ id: r.id, audioFile: r.audio_file }));
}

// Deleting a Rewind erases it, the same way a take is erased (sessionsRepo.ts):
// markRewindDeleted hides it at once and leaves the bare date marker for the
// streak, and eraseRewindRow removes the row (transcript, word timings,
// counts, the coach's notes) when the undo window ends, the app goes to the
// background, or at the next launch. The audio file is deleted by the caller.
export async function markRewindDeleted(id: string): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ date: string }>(`SELECT date FROM day_recalls WHERE id = ?`, [id]);
  if (!row) return false;
  await db.runAsync(`UPDATE day_recalls SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`, [new Date().toISOString(), id]);
  await markPracticeDay(row.date);
  return true;
}

export async function restoreRewind(id: string): Promise<boolean> {
  const db = await getDatabase();
  return (await db.runAsync(`UPDATE day_recalls SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL`, [id])).changes > 0;
}

export async function listPendingDeletedRewinds(onlyId?: string): Promise<{ id: string; audioFile: string | null }[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: string; audio_file: string | null }>(
    `SELECT id, audio_file FROM day_recalls WHERE deleted_at IS NOT NULL AND (? IS NULL OR id = ?)`,
    [onlyId ?? null, onlyId ?? null],
  );
  return rows.map((r) => ({ id: r.id, audioFile: r.audio_file }));
}

export async function eraseRewindRow(id: string): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ date: string }>(`SELECT date FROM day_recalls WHERE id = ?`, [id]);
  if (row) await markPracticeDay(row.date);
  await db.runAsync(`DELETE FROM day_recalls WHERE id = ?`, [id]);
}

// The audio files live Rewinds still point at (for the orphan sweep).
export async function getReferencedRewindFiles(): Promise<Set<string>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ audio_file: string }>(`SELECT audio_file FROM day_recalls WHERE audio_file IS NOT NULL AND deleted_at IS NULL`);
  return new Set(rows.map((r) => r.audio_file));
}

// The local days a Rewind was told, for the streak. (A take that failed to
// process still counts: you did the telling.)
export async function getRewindDates(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ date: string }>(`SELECT DISTINCT date FROM day_recalls WHERE deleted_at IS NULL`);
  return rows.map((r) => r.date);
}

export async function hasRewindToday(): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM day_recalls WHERE deleted_at IS NULL AND date = ?`, [todayISODate()]);
  return (row?.n ?? 0) > 0;
}

// Rewinds that were being processed when the app was closed, with what they
// need to start again (null: nothing was kept).
export async function listProcessingRewinds(): Promise<{ id: string; pending: RewindPending | null }[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: string; pending_json: string | null }>(`SELECT id, pending_json FROM day_recalls WHERE status = 'processing' AND deleted_at IS NULL`);
  return rows.map((r) => ({ id: r.id, pending: parse<RewindPending>(r.pending_json) }));
}

export async function setRewindPending(id: string, pending: RewindPending): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE day_recalls SET pending_json = ? WHERE id = ?`, [JSON.stringify(pending), id]);
}
