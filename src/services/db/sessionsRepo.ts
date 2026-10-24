import { getDatabase } from "./database";
import { rowToSession, type SessionRow } from "./mappers";
import type {
  DspStatus,
  Session,
  SessionStatus,
  TranscriptionSource,
  TranscriptWord,
  WpmPoint,
} from "../../domain/sessionTypes";
import { isoDateFromDate, todayISODate } from "../../utils/dateUtils";
import { markPracticeDay } from "./practiceDaysRepo";

export async function insertSession(session: Session): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO sessions
      (id, prompt_id, recorded_at, video_path, duration_seconds, transcription_source, transcript_verbatim, transcript_clean, status, wants_grading, session_type, script_id, cues_enabled, plan_point_text, plan_reason_text, plan_example_text, video_file, subject_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      session.id,
      session.promptId,
      session.recordedAt,
      session.videoPath,
      session.durationSeconds,
      session.transcriptionSource,
      session.transcriptVerbatim,
      session.transcriptClean,
      session.status,
      session.wantsGrading ? 1 : 0,
      session.sessionType,
      session.scriptId,
      session.cuesEnabled === null ? null : session.cuesEnabled ? 1 : 0,
      session.planPointText,
      session.planReasonText,
      session.planExampleText,
      session.videoFile,
      session.subjectExtras ? JSON.stringify(session.subjectExtras) : null,
      new Date().toISOString(),
    ],
  );
}

// --- Narrow, step-scoped writers --------------------------------------------
// Each analysis step writes only its own columns, so re-running one step
// (e.g. requesting a deep review later) can never wipe another step's
// results — the old shared writer nulled the WPM curve and pitch/volume data
// whenever grading ran after the fact.

export interface TranscriptFields {
  verbatim: string;
  clean: string;
  durationSeconds: number;
  source: TranscriptionSource;
  words: TranscriptWord[] | null;
}

export async function updateTranscriptFields(id: string, fields: TranscriptFields): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE sessions SET transcript_verbatim = ?, transcript_clean = ?, duration_seconds = ?, transcription_source = ?,
       transcript_words_json = ?
     WHERE id = ?`,
    [
      fields.verbatim,
      fields.clean,
      fields.durationSeconds,
      fields.source,
      fields.words ? JSON.stringify(fields.words) : null,
      id,
    ],
  );
}

export interface AudioMetricFields {
  dspStatus: DspStatus | null;
  pitchContourHz: (number | null)[] | null;
  volumeEnvelopeDbfs: number[] | null;
  pitchMedianHz: number | null;
  pitchRangeSt: number | null;
  pitchSdSt: number | null;
  loudnessSpreadDb: number | null;
  loudnessPeakSdDb: number | null;
  wpmCurve: WpmPoint[] | null;
  repeatedWordCount: number | null;
  fillerWordCount: number | null;
  fillerRatePerMinute: number | null;
}

export async function updateAudioMetricFields(id: string, f: AudioMetricFields): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE sessions SET
       dsp_status = ?, pitch_contour_json = ?, volume_envelope_json = ?,
       pitch_median_hz = ?, pitch_range_st = ?, pitch_sd_st = ?, loudness_spread_db = ?, loudness_peak_sd_db = ?,
       wpm_curve_json = ?, repeated_word_count = ?, filler_word_count = ?, filler_rate_per_minute = ?
     WHERE id = ?`,
    [
      f.dspStatus,
      f.pitchContourHz ? JSON.stringify(f.pitchContourHz) : null,
      f.volumeEnvelopeDbfs ? JSON.stringify(f.volumeEnvelopeDbfs) : null,
      f.pitchMedianHz,
      f.pitchRangeSt,
      f.pitchSdSt,
      f.loudnessSpreadDb,
      f.loudnessPeakSdDb,
      f.wpmCurve ? JSON.stringify(f.wpmCurve) : null,
      f.repeatedWordCount,
      f.fillerWordCount,
      f.fillerRatePerMinute,
      id,
    ],
  );
}

export async function updateSessionDerivedStatus(id: string, status: SessionStatus, lastError: string | null): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE sessions SET status = ?, last_error = ?, updated_at = ? WHERE id = ?`, [
    status,
    lastError,
    new Date().toISOString(),
    id,
  ]);
}

export async function updateSessionWants(id: string, wants: { grading?: boolean }): Promise<void> {
  const db = await getDatabase();
  if (wants.grading !== undefined) {
    await db.runAsync(`UPDATE sessions SET wants_grading = ? WHERE id = ?`, [wants.grading ? 1 : 0, id]);
  }
}

// Video files still referenced by a live session — anything else in the
// sessions folder is an orphan (abandoned preview, deleted session).
export async function getReferencedVideoFiles(): Promise<Set<string>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ video_file: string | null }>(
    `SELECT video_file FROM sessions WHERE deleted_at IS NULL AND video_deleted_at IS NULL`,
  );
  return new Set(rows.map((r) => r.video_file).filter((f): f is string => !!f));
}

export interface GeminiFileRef {
  name: string;
  uri: string;
  uploadedAt: string; // ISO datetime
}

// Persisted right after a successful Gemini Files API upload — independent
// of whether the analysis call after it succeeds, so a failed analysis can
// retry against the same uploaded file instead of re-uploading (see
// transcribeSession.ts's resolveUploadForGrading). Pass null to clear.
export async function updateSessionGeminiFile(id: string, file: GeminiFileRef | null): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE sessions SET gemini_file_name = ?, gemini_file_uri = ?, gemini_file_uploaded_at = ? WHERE id = ?`,
    [file?.name ?? null, file?.uri ?? null, file?.uploadedAt ?? null, id],
  );
}

// False once a take has been deleted (or is in its undo window). A step
// that was still running when the take was deleted checks this before it
// records anything about it.
export async function isSessionLive(id: string): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM sessions WHERE id = ? AND deleted_at IS NULL`, [id]);
  return (row?.n ?? 0) > 0;
}

export async function getSessionById(id: string): Promise<Session | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<SessionRow>(
    `SELECT * FROM sessions WHERE id = ?`,
    [id],
  );
  return row ? rowToSession(row) : null;
}

// Returns the promptIds of the most recently recorded sessions (most recent
// first), deduplicated, for use as a "don't repeat" exclusion set when picking
// the next prompt. Any session counts as "used" regardless of status; a
// deleted take doesn't (nothing about it is kept, not even its prompt).
export async function getRecentlyUsedPromptIds(limit: number): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ prompt_id: string }>(
    `SELECT prompt_id FROM sessions WHERE deleted_at IS NULL GROUP BY prompt_id ORDER BY MAX(recorded_at) DESC LIMIT ?`,
    [limit],
  );
  return rows.map((row) => row.prompt_id);
}

// A deleted take isn't returned. "Practiced today" also reads the bare date
// marker a delete leaves (see practiceDaysRepo.ts), so deleting a take never
// un-does the day.
export async function getTodaysSession(): Promise<Session | null> {
  const db = await getDatabase();
  const today = todayISODate();
  const row = await db.getFirstAsync<SessionRow>(
    `SELECT * FROM sessions WHERE recorded_at LIKE ? AND deleted_at IS NULL ORDER BY recorded_at DESC LIMIT 1`,
    [`${today}%`],
  );
  return row ? rowToSession(row) : null;
}

// All sessions, most recent first — used by the History screen. Excludes
// takes in their delete window (see markSessionDeleted below).
export async function getAllSessions(): Promise<Session[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SessionRow>(
    `SELECT * FROM sessions WHERE deleted_at IS NULL ORDER BY recorded_at DESC`,
  );
  return rows.map(rowToSession);
}

interface SessionWithScoreRow extends SessionRow {
  overall_score: number | null;
  score_layer: string | null;
}

export interface SessionWithScore extends Session {
  // The take's score: the judged sheet's overall when Tono AI judged it, else
  // the measured one (null while unscored).
  overallScore: number | null;
  // Which layer that score is from, so a list can mark judged takes and
  // average each layer apart.
  scoreLayer: "judged" | "measured" | null;
}

// Same as getAllSessions, but also brings back each session's score and the
// layer it is from (null for unscored sessions) in one query, so the Library
// can show a score on each card without a fetch per row.
export async function getAllSessionsWithScores(): Promise<SessionWithScore[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SessionWithScoreRow>(
    `SELECT s.*, s.session_score AS overall_score, json_extract(a.json, '$.headline') AS score_layer
     FROM sessions s
     LEFT JOIN session_artifacts a ON a.session_id = s.id AND a.kind = 'session_score'
     WHERE s.deleted_at IS NULL
     ORDER BY s.recorded_at DESC`,
  );
  return rows.map((row) => ({
    ...rowToSession(row),
    overallScore: row.overall_score,
    scoreLayer: row.overall_score == null ? null : row.score_layer === "judged" ? "judged" : "measured",
  }));
}

// "Delete video only" — frees device storage while keeping the session fully
// intact and visible (transcript, scores, History card). The caller is
// responsible for deleting the actual video file (see deleteRecording in
// storage/videoStorage.ts); this just marks it gone in the DB.
export async function deleteSessionVideo(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE sessions SET video_deleted_at = ? WHERE id = ?`, [
    new Date().toISOString(),
    id,
  ]);
}

// --- Deleting a take --------------------------------------------------------
// Deleting a take erases everything about it. Because of the short undo, that
// happens in two steps: markSessionDeleted hides it everywhere at once (every
// query skips a take with deleted_at set, so no total, trend, streak or
// average counts it), and eraseSessionRows removes it for good when the undo
// window ends, the app goes to the background, or at the next launch if the
// app was killed in between (services/data/takeDeletion.ts). The files and
// remote copies are removed by the caller.

// Hides a take and leaves the bare date marker that keeps the streak. Returns
// false when there is no such take.
export async function markSessionDeleted(id: string): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ recorded_at: string; status: string }>(`SELECT recorded_at, status FROM sessions WHERE id = ?`, [id]);
  if (!row) return false;
  await db.runAsync(`UPDATE sessions SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`, [new Date().toISOString(), id]);
  if (row.status === "done") await markPracticeDay(isoDateFromDate(new Date(row.recorded_at)));
  return true;
}

// Undo, inside the window.
// False when the take is already gone (the window ended first).
export async function restoreSession(id: string): Promise<boolean> {
  const db = await getDatabase();
  return (await db.runAsync(`UPDATE sessions SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL`, [id])).changes > 0;
}

export interface PendingDeletedSession {
  id: string;
  videoFile: string | null;
  videoPath: string;
  geminiFileName: string | null;
  geminiFileUri: string | null;
}

// Takes waiting to be erased (their undo window ended, or the app was killed
// during it).
export async function listPendingDeletedSessions(onlyId?: string): Promise<PendingDeletedSession[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: string; video_file: string | null; video_path: string; gemini_file_name: string | null; gemini_file_uri: string | null }>(
    `SELECT id, video_file, video_path, gemini_file_name, gemini_file_uri FROM sessions WHERE deleted_at IS NOT NULL AND (? IS NULL OR id = ?)`,
    [onlyId ?? null, onlyId ?? null],
  );
  return rows.map((r) => ({ id: r.id, videoFile: r.video_file, videoPath: r.video_path, geminiFileName: r.gemini_file_name, geminiFileUri: r.gemini_file_uri }));
}

// Every table that holds something about one take, by session id.
export const SESSION_CHILD_TABLES = ["scores", "session_steps", "session_artifacts", "review_passes", "skill_events"] as const;

// Removes the take and everything about it: scores, steps, analysis and review
// artifacts, review passes, its rating history (skill_events), the skill
// check that was built on it, and the row itself. Already-computed state
// (mastery ratings, stages, the path) is left as it is; nothing computed from
// here on can count the take.
export async function eraseSessionRows(id: string): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ recorded_at: string; status: string }>(`SELECT recorded_at, status FROM sessions WHERE id = ?`, [id]);
    if (row?.status === "done") await markPracticeDay(isoDateFromDate(new Date(row.recorded_at)));
    for (const table of SESSION_CHILD_TABLES) await db.runAsync(`DELETE FROM ${table} WHERE session_id = ?`, [id]);
    // A skill check built on this take (its results are numbers from the take).
    await db.runAsync(`UPDATE skill_checks SET retake_of = NULL WHERE retake_of IN (SELECT id FROM skill_checks WHERE session_id = ?)`, [id]);
    await db.runAsync(`DELETE FROM skill_checks WHERE session_id = ?`, [id]);
    await db.runAsync(`DELETE FROM sessions WHERE id = ?`, [id]);
  });
}

// Children left behind by a write that landed after its take was erased (a
// pipeline step still running when the take was deleted). Run at launch.
export async function sweepOrphanedSessionRows(): Promise<number> {
  const db = await getDatabase();
  let removed = 0;
  await db.withTransactionAsync(async () => {
    for (const table of SESSION_CHILD_TABLES) {
      removed += (await db.runAsync(`DELETE FROM ${table} WHERE session_id IS NOT NULL AND session_id NOT IN (SELECT id FROM sessions)`)).changes;
    }
  });
  return removed;
}
