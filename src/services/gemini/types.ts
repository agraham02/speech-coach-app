export interface UploadedGeminiFile {
  name: string; // e.g. "files/abc123"
  uri: string; // full file resource URI, used as file_data.file_uri
  mimeType: string;
  state: "PROCESSING" | "ACTIVE" | "FAILED";
}

export type StructureUsed = "what/why/how" | "story arc" | "none detected" | "other";
export type Archetype = "Motivator" | "Educator" | "Coach" | "Friend";

export interface ScoredNote {
  score: number;
  notes: string;
}

export interface GeminiSessionAnalysis {
  transcript_verbatim: string;
  transcript_clean: string;
  duration_seconds: number;
  structure: {
    score: number;
    structure_used: StructureUsed;
    notes: string;
  };
  delivery: {
    rate: ScoredNote & { wpm_avg: number };
    volume: ScoredNote;
    pitch_melody: ScoredNote;
    tonality: ScoredNote;
    pausing: ScoredNote;
  };
  presence: {
    eye_contact_score: number;
    facial_expressiveness_score: number;
    body_language_notes: string;
  };
  combined: {
    face_voice_congruence_score: number;
    archetype_detected: Archetype;
    archetype_fit_for_topic: string;
    overall_score: number;
  };
  coaching: {
    summary: string;
    top_strength: string;
    top_focus_area: string;
    recommended_drill: string;
  };
}

export interface GeminiTranscriptOnly {
  transcript_verbatim: string;
  transcript_clean: string;
  duration_seconds: number;
}

export class GeminiApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "GeminiApiError";
  }
}
