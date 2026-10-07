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
import { todayISODate } from "../../utils/dateUtils";

export async function insertSession(session: Session): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO sessions
      (id, prompt_id, recorded_at, video_path, duration_seconds, transcription_source, transcript_verbatim, transcript_clean, status, notion_synced_at, wants_grading, wants_notion_sync, session_type, script_id, cues_enabled, plan_point_text, plan_reason_text, plan_example_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      session.notionSyncedAt,
      session.wantsGrading ? 1 : 0,
      session.wantsNotionSync ? 1 : 0,
      session.sessionType,
      session.scriptId,
      session.cuesEnabled === null ? null : session.cuesEnabled ? 1 : 0,
      session.planPointText,
      session.planReasonText,
      session.planExampleText,
    ],
  );
}

export async function updateSessionTranscripts(
  id: string,
  transcriptVerbatim: string,
  transcriptClean: string,
  durationSeconds: number,
  transcriptionSource: TranscriptionSource,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE sessions SET transcript_verbatim = ?, transcript_clean = ?, duration_seconds = ?, transcription_source = ? WHERE id = ?`,
    [transcriptVerbatim, transcriptClean, durationSeconds, transcriptionSource, id],
  );
}

// Audio-first pipeline (Phase 2) follow-up write — populated after
// transcription/DSP analysis completes, independent of wants_grading (same
// convention as updateSessionFillerStats below). Whichever fields the caller
// doesn't have (e.g. DSP failed, or no word-level transcript was available)
// are passed as null and stored as such, never silently omitted — a null
// dsp_status specifically means "never attempted," distinct from a
// 'failed' status that means "attempted and failed."
export interface AudioAnalysisUpdate {
  transcriptWords: TranscriptWord[] | null;
  wpmCurve: WpmPoint[] | null;
  repeatedWordCount: number | null;
  assemblyaiTranscriptId: string | null;
  dspStatus: DspStatus | null;
  pitchContourHz: (number | null)[] | null;
  volumeEnvelopeDbfs: number[] | null;
  pitchAvgHz: number | null;
  pitchMinHz: number | null;
  pitchMaxHz: number | null;
  volumeAvgDbfs: number | null;
  volumeStddevDbfs: number | null;
}

export async function updateSessionAudioAnalysis(id: string, update: AudioAnalysisUpdate): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE sessions SET
       transcript_words_json = ?, wpm_curve_json = ?, repeated_word_count = ?, assemblyai_transcript_id = ?,
       dsp_status = ?, pitch_contour_json = ?, volume_envelope_json = ?,
       pitch_avg_hz = ?, pitch_min_hz = ?, pitch_max_hz = ?, volume_avg_dbfs = ?, volume_stddev_dbfs = ?
     WHERE id = ?`,
    [
      update.transcriptWords ? JSON.stringify(update.transcriptWords) : null,
      update.wpmCurve ? JSON.stringify(update.wpmCurve) : null,
      update.repeatedWordCount,
      update.assemblyaiTranscriptId,
      update.dspStatus,
      update.pitchContourHz ? JSON.stringify(update.pitchContourHz) : null,
      update.volumeEnvelopeDbfs ? JSON.stringify(update.volumeEnvelopeDbfs) : null,
      update.pitchAvgHz,
      update.pitchMinHz,
      update.pitchMaxHz,
      update.volumeAvgDbfs,
      update.volumeStddevDbfs,
      id,
    ],
  );
}

// Computed on-device from transcript_verbatim right after transcription
// succeeds — independent of whether grading was requested for this session.
export async function updateSessionFillerStats(
  id: string,
  fillerWordCount: number,
  fillerRatePerMinute: number,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE sessions SET filler_word_count = ?, filler_rate_per_minute = ? WHERE id = ?`,
    [fillerWordCount, fillerRatePerMinute, id],
  );
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

export async function updateSessionStatus(
  id: string,
  status: SessionStatus,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE sessions SET status = ? WHERE id = ?`, [
    status,
    id,
  ]);
}

export async function markSessionNotionSynced(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE sessions SET notion_synced_at = ? WHERE id = ?`, [
    new Date().toISOString(),
    id,
  ]);
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
// the next prompt. Any session counts as "used" regardless of status.
export async function getRecentlyUsedPromptIds(limit: number): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ prompt_id: string }>(
    `SELECT prompt_id FROM sessions GROUP BY prompt_id ORDER BY MAX(recorded_at) DESC LIMIT ?`,
    [limit],
  );
  return rows.map((row) => row.prompt_id);
}

// Deliberately not filtered by deleted_at — a soft-deleted session was still
// recorded today for the purposes of "have you practiced today," but once
// it's gone from History it shouldn't count, so the user can freely
// re-record if they deleted their only session for the day.
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
// soft-deleted sessions (see deleteSession below).
export async function getAllSessions(): Promise<Session[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SessionRow>(
    `SELECT * FROM sessions WHERE deleted_at IS NULL ORDER BY recorded_at DESC`,
  );
  return rows.map(rowToSession);
}

interface SessionWithScoreRow extends SessionRow {
  overall_score: number | null;
}

export interface SessionWithScore extends Session {
  overallScore: number | null;
}

// Same as getAllSessions, but also brings back each session's overall score
// (null for ungraded sessions) in one query — used by the History screen so
// it can show a score on each card without an extra fetch per row.
export async function getAllSessionsWithScores(): Promise<SessionWithScore[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SessionWithScoreRow>(
    `SELECT s.*, sc.overall_score
     FROM sessions s
     LEFT JOIN scores sc ON sc.session_id = s.id
     WHERE s.deleted_at IS NULL
     ORDER BY s.recorded_at DESC`,
  );
  return rows.map((row) => ({ ...rowToSession(row), overallScore: row.overall_score }));
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

// Soft-deletes a session: hides it from History (getAllSessions/
// getAllSessionsWithScores/getTodaysSession all filter on deleted_at) and
// marks its video gone, but never actually removes the sessions/scores rows
// — so Trends' streaks and averages keep counting it forever. The caller is
// still responsible for deleting the actual video file, same as before.
export async function deleteSession(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(`UPDATE sessions SET deleted_at = ?, video_deleted_at = ? WHERE id = ?`, [
    now,
    now,
    id,
  ]);
}
