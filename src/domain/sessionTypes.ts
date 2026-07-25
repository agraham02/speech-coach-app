export interface Prompt {
  id: string;
  category: string;
  text: string;
}

export type TranscriptionSource = "gemini" | "on_device";

export type SessionStatus =
  | "recording"
  | "processing"
  | "done"
  | "error";

export interface Session {
  id: string;
  promptId: string;
  recordedAt: string; // ISO datetime
  videoPath: string;
  durationSeconds: number;
  transcriptionSource: TranscriptionSource;
  transcriptVerbatim: string | null;
  transcriptClean: string | null;
  status: SessionStatus;
  notionSyncedAt: string | null;
}

export interface GeminiPhase1Result {
  transcript_verbatim: string;
  transcript_clean: string;
  duration_seconds: number;
}
