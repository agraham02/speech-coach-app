import type { GeminiQuoteAnnotation } from "./transcriptAnnotations";
import type { Script } from "./scriptTypes";
import type { PlanText } from "./planYourPoint";
import type { PracticeContext } from "./practice";

export type DifficultyTier = "easy" | "medium" | "hard";

export interface Prompt {
  id: string;
  category: string;
  text: string;
  // null only for FREE_RECORD_PROMPT — it isn't a selectable curriculum item,
  // so there's nothing meaningful to tag a difficulty on.
  difficultyTier: DifficultyTier | null;
}

// One completed Tongue-Twister Drill attempt (Phase 3) — deliberately not a
// `Session`: no video, no Gemini grading, no prompt_id. accuracyPercent is 0
// for manual-timer-fallback attempts (no STT transcript to compare against).
export interface DrillCompletion {
  id: string;
  twisterId: string;
  completedAt: string;
  accuracyPercent: number;
  wpm: number;
  difficulty: DifficultyTier;
}

// One row per actual curriculum level change (Phase 5) — not per
// evaluation, keeping the table tiny. spontaneousSessionCount is the
// cooldown checkpoint: the next change is only considered once this many
// *new* eligible spontaneous sessions have landed since.
export interface CurriculumStateEntry {
  id: number;
  changedAt: string;
  level: number;
  direction: string; // 'up' | 'down' | 'initial'
  spontaneousComposite: number | null;
  drillComposite: number | null;
  spontaneousSessionCount: number;
  reasonCode: string;
}

// What a recording is "about" — threaded from the Recording screen all the
// way through Preview/Processing to sessionProcessor, so the DB insert and
// the Gemini grading call both know whether this is a spontaneous/free-record
// prompt or a fixed Script Practice script (and, for scripts, whether cues
// were shown). planText (Plan Your Point) and conciseSeconds (Concise Mode)
// are both optional, independent, prompt-only add-ons — a session could
// technically use either, both, or neither.
export type RecordingSubject =
  | {
      kind: "prompt";
      prompt: Prompt;
      planText?: PlanText;
      conciseSeconds?: number;
      // Set when the rep belongs to a lesson / daily plan (Phase 3).
      lessonId?: string;
      targetFramework?: string;
      targetSeconds?: number;
      prepSeconds?: number;
      // Plan/lesson step this rep completes (not persisted with the session).
      practice?: PracticeContext;
    }
  | { kind: "script"; script: Script; cuesEnabled: boolean };

// 'whisper_ondevice' is the default free path (react-native-executorch,
// Phase 2 — the plan originally targeted Moonshine, but the installed
// package's speech-to-text module only ships Whisper; see plan.md's
// correction note). 'assemblyai' is the opt-in paid upgrade. 'on_device' is
// kept for pre-Phase-2 rows that used that generic value; 'gemini' is the
// fallback when neither on-device nor AssemblyAI produced a transcript.
export type TranscriptionSource = "gemini" | "on_device" | "whisper_ondevice" | "assemblyai";

export interface TranscriptWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface WpmPoint {
  bucketStartSeconds: number;
  wpm: number;
}

export type DspStatus = "complete" | "failed";

export type SessionStatus =
  | "recording"
  | "processing"
  | "done"
  | "error";

// "concise" mirrors "free_record" — a distinct opt-in short-recording drill,
// not a duration variant of "spontaneous".
export type SessionType = "spontaneous" | "free_record" | "concise" | "script_practice";

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
  // Plan Your Point (PREP framework), captured before recording started —
  // null for every session recorded before this feature shipped, or where
  // the setting was off, or where the speaker left every field blank.
  planPointText: string | null;
  planReasonText: string | null;
  planExampleText: string | null;
  // Audio-first pipeline (Phase 2) — all nullable, populated in a follow-up
  // write after transcription/analysis completes, independent of wantsGrading
  // (same convention as fillerWordCount above). transcriptWords/wpmCurve come
  // from whichever transcript engine actually ran (on-device ASR by default,
  // AssemblyAI if opted in) — null if both that and the Gemini-fallback path
  // were used instead (no word-level timestamps available in that case).
  transcriptWords: TranscriptWord[] | null;
  wpmCurve: WpmPoint[] | null;
  repeatedWordCount: number | null;
  assemblyaiTranscriptId: string | null;
  // dspStatus null = never attempted (e.g. decode failed before analysis
  // could even start); 'failed' = attempted and failed; 'complete' = the
  // pitch/volume fields below are populated.
  dspStatus: DspStatus | null;
  pitchContourHz: (number | null)[] | null;
  volumeEnvelopeDbfs: number[] | null;
  pitchAvgHz: number | null;
  pitchMinHz: number | null;
  pitchMaxHz: number | null;
  volumeAvgDbfs: number | null;
  volumeStddevDbfs: number | null;
  // A successfully-uploaded-but-not-yet-(or-no-longer)-graded Gemini Files
  // API entry — set right after upload succeeds, independent of whether the
  // grading call after it succeeds. Lets a retry after a failed analysis
  // reuse the same upload instead of re-uploading the video (see
  // transcribeSession.ts's resolveUploadForGrading). All null together, or
  // all set together — never a partial combination.
  geminiFileName: string | null;
  geminiFileUri: string | null;
  geminiFileUploadedAt: string | null; // ISO datetime
  // Migration v14. videoFile is the file name inside Documents/sessions —
  // resolve it with videoStorage.resolveVideoUri() rather than trusting
  // videoPath, because the iOS app-container path changes between builds.
  videoFile: string | null;
  lastError: string | null;
  updatedAt: string | null;
  subjectExtras: SessionSubjectExtras | null;
  notionBlockId: string | null;
}

// Recording-context details with no dedicated column, kept so "Practice
// this prompt again" / Retake can rebuild the exact same subject.
export interface SessionSubjectExtras {
  conciseSeconds?: number;
  // Curriculum context (Phase 3): which lesson/framework this rep was for.
  lessonId?: string;
  targetFramework?: string;
  // For ad-hoc prompts (id starts with ADHOC_PROMPT_PREFIX) that aren't in
  // the prompt library — follow-up questions, generated drill prompts.
  promptText?: string;
  promptCategory?: string;
}

export const ADHOC_PROMPT_PREFIX = "adhoc_";

export function makeAdhocPrompt(text: string, category: string): Prompt {
  return { id: `${ADHOC_PROMPT_PREFIX}${Date.now().toString(36)}`, category, text, difficultyTier: null };
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
