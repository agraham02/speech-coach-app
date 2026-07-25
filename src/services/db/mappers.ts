import type { Session, SessionStatus, TranscriptionSource } from "../../domain/sessionTypes";

export interface SessionRow {
  id: string;
  prompt_id: string;
  recorded_at: string;
  video_path: string;
  duration_seconds: number;
  transcription_source: string;
  transcript_verbatim: string | null;
  transcript_clean: string | null;
  status: string;
  notion_synced_at: string | null;
}

export function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    promptId: row.prompt_id,
    recordedAt: row.recorded_at,
    videoPath: row.video_path,
    durationSeconds: row.duration_seconds,
    transcriptionSource: row.transcription_source as TranscriptionSource,
    transcriptVerbatim: row.transcript_verbatim,
    transcriptClean: row.transcript_clean,
    status: row.status as SessionStatus,
    notionSyncedAt: row.notion_synced_at,
  };
}

export function sessionToInsertParams(session: Session): SessionRow {
  return {
    id: session.id,
    prompt_id: session.promptId,
    recorded_at: session.recordedAt,
    video_path: session.videoPath,
    duration_seconds: session.durationSeconds,
    transcription_source: session.transcriptionSource,
    transcript_verbatim: session.transcriptVerbatim,
    transcript_clean: session.transcriptClean,
    status: session.status,
    notion_synced_at: session.notionSyncedAt,
  };
}
