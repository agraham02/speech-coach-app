import type {
  Archetype,
  Session,
  SessionScores,
  SessionStatus,
  StructureUsed,
  TranscriptionSource,
} from "../../domain/sessionTypes";
import type { GeminiQuoteAnnotation } from "../../domain/transcriptAnnotations";
import { logger } from "../../utils/logger";

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
  wants_grading: number;
  wants_notion_sync: number;
  filler_word_count: number | null;
  filler_rate_per_minute: number | null;
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
    wantsGrading: row.wants_grading === 1,
    wantsNotionSync: row.wants_notion_sync === 1,
    fillerWordCount: row.filler_word_count,
    fillerRatePerMinute: row.filler_rate_per_minute,
  };
}

export interface ScoreRow {
  session_id: string;
  structure_score: number;
  structure_used: string;
  structure_notes: string;
  content_relevance_score: number;
  content_relevance_notes: string;
  content_coherence_score: number;
  content_coherence_notes: string;
  rate_score: number;
  rate_wpm_avg: number;
  rate_notes: string;
  volume_score: number;
  volume_notes: string;
  pitch_melody_score: number;
  pitch_melody_notes: string;
  tonality_score: number;
  tonality_notes: string;
  pausing_score: number;
  pausing_notes: string;
  eye_contact_score: number;
  facial_expressiveness_score: number;
  body_language_notes: string;
  face_voice_congruence_score: number;
  archetype_detected: string;
  archetype_fit_for_topic: string;
  overall_score: number;
  coaching_summary: string;
  top_strength: string;
  top_focus_area: string;
  recommended_drill: string;
  annotations_json: string;
}

function parseAnnotationsJson(json: string): GeminiQuoteAnnotation[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as GeminiQuoteAnnotation[]) : [];
  } catch (error) {
    logger.warn(`[db] failed to parse annotations_json, defaulting to []: ${(error as Error).message}`);
    return [];
  }
}

export function rowToScores(row: ScoreRow): SessionScores {
  return {
    sessionId: row.session_id,
    structureScore: row.structure_score,
    structureUsed: row.structure_used as StructureUsed,
    structureNotes: row.structure_notes,
    relevanceScore: row.content_relevance_score,
    relevanceNotes: row.content_relevance_notes,
    coherenceScore: row.content_coherence_score,
    coherenceNotes: row.content_coherence_notes,
    rateScore: row.rate_score,
    rateWpmAvg: row.rate_wpm_avg,
    rateNotes: row.rate_notes,
    volumeScore: row.volume_score,
    volumeNotes: row.volume_notes,
    pitchMelodyScore: row.pitch_melody_score,
    pitchMelodyNotes: row.pitch_melody_notes,
    tonalityScore: row.tonality_score,
    tonalityNotes: row.tonality_notes,
    pausingScore: row.pausing_score,
    pausingNotes: row.pausing_notes,
    eyeContactScore: row.eye_contact_score,
    facialExpressivenessScore: row.facial_expressiveness_score,
    bodyLanguageNotes: row.body_language_notes,
    faceVoiceCongruenceScore: row.face_voice_congruence_score,
    archetypeDetected: row.archetype_detected as Archetype,
    archetypeFitForTopic: row.archetype_fit_for_topic,
    overallScore: row.overall_score,
    coachingSummary: row.coaching_summary,
    topStrength: row.top_strength,
    topFocusArea: row.top_focus_area,
    recommendedDrill: row.recommended_drill,
    annotations: parseAnnotationsJson(row.annotations_json),
  };
}
