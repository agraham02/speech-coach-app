import type { GeminiQuoteAnnotation } from "./transcriptAnnotations";
import type { Script } from "./scriptTypes";

export type DifficultyTier = "easy" | "medium" | "hard";

export interface Prompt {
  id: string;
  category: string;
  text: string;
  // null only for FREE_RECORD_PROMPT — it isn't a selectable curriculum item,
  // so there's nothing meaningful to tag a difficulty on.
  difficultyTier: DifficultyTier | null;
}

// What a recording is "about" — threaded from the Recording screen all the
// way through Preview/Processing to sessionProcessor, so the DB insert and
// the Gemini grading call both know whether this is a spontaneous/free-record
// prompt or a fixed Script Practice script (and, for scripts, whether cues
// were shown).
export type RecordingSubject =
  | { kind: "prompt"; prompt: Prompt }
  | { kind: "script"; script: Script; cuesEnabled: boolean };

export type TranscriptionSource = "gemini" | "on_device";

export type SessionStatus =
  | "recording"
  | "processing"
  | "done"
  | "error";

export type SessionType = "spontaneous" | "free_record" | "script_practice";

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
  wantsGrading: boolean;
  wantsNotionSync: boolean;
  // Defaults to 'spontaneous' for every pre-existing row (see migration v7).
  // scriptId/cuesEnabled are only ever non-null when sessionType is
  // 'script_practice'.
  sessionType: SessionType;
  scriptId: string | null;
  cuesEnabled: boolean | null;
  // Computed on-device from transcriptVerbatim right after transcription —
  // null until then, independent of whether grading was requested.
  fillerWordCount: number | null;
  fillerRatePerMinute: number | null;
  // Null means present. videoDeletedAt: the "delete video only" action —
  // videoPath itself is left as a historical reference, just no longer
  // trusted to point at a real file. deletedAt: a soft delete for the
  // session as a whole — hidden from History, but the row (and its scores)
  // are never actually removed, so Trends keeps counting it forever.
  videoDeletedAt: string | null;
  deletedAt: string | null;
}

export type StructureUsed = "what/why/how" | "story arc" | "none detected" | "other";
export type Archetype = "Motivator" | "Educator" | "Coach" | "Friend";

// Phase 3 (structure, delivery, coaching) + Phase 4 (presence, combined).
export interface SessionScores {
  sessionId: string;
  structureScore: number;
  structureUsed: StructureUsed;
  structureNotes: string;
  relevanceScore: number;
  relevanceNotes: string;
  coherenceScore: number;
  coherenceNotes: string;
  rateScore: number;
  rateWpmAvg: number;
  rateNotes: string;
  volumeScore: number;
  volumeNotes: string;
  pitchMelodyScore: number;
  pitchMelodyNotes: string;
  tonalityScore: number;
  tonalityNotes: string;
  pausingScore: number;
  pausingNotes: string;
  eyeContactScore: number;
  facialExpressivenessScore: number;
  bodyLanguageNotes: string;
  faceVoiceCongruenceScore: number;
  archetypeDetected: Archetype;
  archetypeFitForTopic: string;
  overallScore: number;
  coachingSummary: string;
  topStrength: string;
  topFocusArea: string;
  recommendedDrill: string;
  annotations: GeminiQuoteAnnotation[];
  // Only populated for script_practice sessions recorded with cues enabled —
  // null for every other session (spontaneous, free_record, or cues-off).
  cueComplianceScore: number | null;
  cueComplianceNotes: string | null;
}
