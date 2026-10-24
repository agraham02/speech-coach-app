import { checkExistingFileActive, generateContent, uploadVideoFile, waitForFileActive, type GeminiTransport, type HostedResult } from "./geminiClient";
import type { TokenUsage } from "../../domain/cloudUsage";
import { reviewUploadCopy } from "../storage/videoTranscode";
import type { PromptTaskContext } from "../../domain/promptTask";
import {
  buildResponseSchemaWithCueCompliance,
  buildScriptSystemPrompt,
  buildSystemPrompt,
  buildTranscriptOnlySystemPrompt,
  hostedReviewSection,
  RESPONSE_SCHEMA,
  SPEECH_IS_DATA,
  STUTTER_NOTE,
  TRANSCRIPT_ONLY_SCHEMA,
  withQuickCoach,
} from "./schema";
import {
  GeminiApiError,
  type AnnotationCategory,
  type GeminiSessionAnalysis,
  type GeminiTranscriptOnly,
  type TranscriptAnnotation,
  type UploadedGeminiFile,
} from "./types";
import type { MarkLevel, Script } from "../../domain/scriptTypes";
import type { PlanText } from "../../domain/planYourPoint";
import { logger } from "../../utils/logger";
import { defaultsFromProfile } from "../../domain/profile";
import { getUserProfile } from "../prefs/prefsStore";
import { speakerContextForReview } from "../cloud/speakerContext";

export type TranscribeProgressStep =
  | "uploading"
  | "processing"
  | "transcribing";

// Grading context for a session: either a spontaneous/free-record prompt, or
// a fixed Script Practice script (with whatever cuesEnabled was chosen at
// recording time). Determines which system prompt + response schema
// transcribeSession uses.
export type GradingContext =
  | { kind: "prompt"; promptText: string; planText?: PlanText; taskContext?: PromptTaskContext }
  | { kind: "script"; script: Script; cuesEnabled: boolean; markLevel?: MarkLevel };

// Shared by transcribeSession and transcribeOnly: upload the recording to the
// Gemini Files API and wait for it to become ACTIVE before generateContent
// can reference it.
async function uploadAndWaitForActive(videoUri: string, onProgress?: (step: TranscribeProgressStep) => void, transport: GeminiTransport = "direct") {
  onProgress?.("uploading");
  // A 720p copy at about 1 Mb/s gives the model the same input (it samples 1
  // frame a second) for a tenth of the upload (services/storage/videoTranscode.ts).
  const copy = await reviewUploadCopy(videoUri);
  logger.info(`[gemini] uploading video file (${transport})...`);
  let uploaded: Awaited<ReturnType<typeof uploadVideoFile>>;
  try {
    uploaded = await uploadVideoFile(copy.uri, "video/mp4", `session-${Date.now()}.mp4`, transport);
  } finally {
    copy.cleanup();
  }
  logger.info(`[gemini] upload complete: ${uploaded.name} (state=${uploaded.state})`);

  onProgress?.("processing");
  logger.info(`[gemini] waiting for ${uploaded.name} to become ACTIVE...`);
  await waitForFileActive(uploaded.name, { transport });
  logger.info(`[gemini] ${uploaded.name} is ACTIVE`);

  return uploaded;
}

// Validated by both parseGeminiSessionAnalysis and parseTranscriptOnly: every
// Gemini response schema in this app includes these two transcripts.
function extractTranscriptFields(
  candidate: Partial<GeminiTranscriptOnly>,
  parsed: unknown,
): Pick<GeminiTranscriptOnly, "transcript_verbatim" | "transcript_clean" | "duration_seconds"> {
  if (
    typeof candidate.transcript_verbatim !== "string" ||
    typeof candidate.transcript_clean !== "string" ||
    typeof candidate.duration_seconds !== "number"
  ) {
    throw new GeminiApiError(
      "Gemini response JSON did not match the expected schema (transcript fields)",
      undefined,
      parsed,
    );
  }
  return {
    transcript_verbatim: candidate.transcript_verbatim,
    transcript_clean: candidate.transcript_clean,
    duration_seconds: candidate.duration_seconds,
  };
}

// Exported separately from analyzeUploadedVideo (below) so sessionProcessor.ts
// can start this upload — today's dominant latency cost — concurrently with
// on-device ASR/DSP, instead of waiting for those to resolve
// first. transcribeSession() (further below) composes the two sequentially
// for callers that don't need the parallel-upload optimization (the
// on-demand "Grade with Gemini" retry path).
export async function uploadVideoForGrading(
  videoUri: string,
  onProgress?: (step: TranscribeProgressStep) => void,
  transport: GeminiTransport = "direct",
): Promise<UploadedGeminiFile> {
  return uploadAndWaitForActive(videoUri, onProgress, transport);
}

export interface ExistingGeminiUpload {
  name: string;
  uri: string;
  uploadedAt: string; // ISO datetime
}

// Gemini Files API entries expire 48h after upload — a 1h safety margin
// keeps a slow retry from reusing a reference that expires mid-request.
const FILE_REUSE_WINDOW_MS = 47 * 60 * 60 * 1000;

// Resolves an UploadedGeminiFile for grading — reuses a still-fresh,
// still-ACTIVE upload from a previous attempt when one exists (skipping the
// re-upload entirely), falling back to a normal fresh upload otherwise.
// This is what makes "upload succeeded, analysis failed, retry" cheap: only
// the failed analysis step re-runs, not the (usually much slower) video
// upload. `reused: false` tells the caller to persist the freshly-uploaded
// file's reference for next time; `reused: true` means the stored one is
// still good, nothing new to persist.
export async function resolveUploadForGrading(
  videoUri: string,
  existingUpload: ExistingGeminiUpload | null,
  onProgress?: (step: TranscribeProgressStep) => void,
  transport: GeminiTransport = "direct",
): Promise<{ uploaded: UploadedGeminiFile; reused: boolean }> {
  const isFresh = existingUpload && Date.now() - Date.parse(existingUpload.uploadedAt) < FILE_REUSE_WINDOW_MS;
  if (existingUpload && isFresh && (await checkExistingFileActive(existingUpload.name, transport))) {
    logger.info(`[gemini] reusing previously-uploaded file ${existingUpload.name} — skipping re-upload`);
    onProgress?.("processing");
    return {
      uploaded: { name: existingUpload.name, uri: existingUpload.uri, mimeType: "video/mp4", state: "ACTIVE" },
      reused: true,
    };
  }
  if (existingUpload) {
    logger.info(`[gemini] previously-uploaded file ${existingUpload.name} is no longer usable — uploading fresh`);
  }
  const uploaded = await uploadAndWaitForActive(videoUri, onProgress, transport);
  return { uploaded, reused: false };
}

// How a hosted (Tono AI) review is run: the server sizes its reservation from
// the video's length and reports which model it used.
export interface HostedReviewOptions {
  transport: GeminiTransport;
  videoSeconds: number;
  // What the phone measured, as prompt lines (cloud/measuredReview.ts): the
  // notes may quote them; they never touch a score.
  measurements?: string[];
  onHosted?: (result: HostedResult) => void;
}

export async function analyzeUploadedVideo(
  uploaded: UploadedGeminiFile,
  context: GradingContext,
  onProgress?: (step: TranscribeProgressStep) => void,
  onUsage?: (usage: TokenUsage) => void,
  hosted?: HostedReviewOptions,
): Promise<GeminiSessionAnalysis> {
  const systemPrompt =
    (context.kind === "script"
      ? buildScriptSystemPrompt(context.script, context.cuesEnabled ? context.markLevel ?? "full" : "none")
      : buildSystemPrompt(context.promptText, context.planText, context.taskContext)) +
    (hosted ? hostedReviewSection(hosted.measurements ?? []) : "") +
    speakerContextForReview() +
    SPEECH_IS_DATA +
    (defaultsFromProfile(getUserProfile()).stutterMode ? STUTTER_NOTE : "");
  const showsCueCompliance =
    context.kind === "script" && context.cuesEnabled && context.script.marks.length > 0;
  const baseSchema = showsCueCompliance ? buildResponseSchemaWithCueCompliance() : RESPONSE_SCHEMA;
  const responseSchema = hosted ? withQuickCoach(baseSchema) : baseSchema;

  onProgress?.("transcribing");
  logger.info("[gemini] calling generateContent...");
  const responseText = await generateContent({
    fileUri: uploaded.uri,
    mimeType: "video/mp4",
    systemPrompt,
    responseSchema,
    mediaResolution: "MEDIA_RESOLUTION_LOW",
    onUsage,
    ...(hosted ? { transport: hosted.transport, fileName: uploaded.name, videoSeconds: hosted.videoSeconds, kind: "review" as const, onHosted: hosted.onHosted } : {}),
  });
  logger.info(`[gemini] generateContent returned ${responseText.length} chars`);

  const result = parseGeminiSessionAnalysis(responseText);
  logger.info(
    `[gemini] parsed OK: verbatim=${result.transcript_verbatim.length} chars, clean=${result.transcript_clean.length} chars, ` +
      `duration=${result.duration_seconds}s, structure=${result.structure.score}/10 (${result.structure.structure_used}), ` +
      `content relevance=${result.content.relevance_score}/coherence=${result.content.coherence_score}, ` +
      `delivery avg=${(
        (result.delivery.rate.score +
          result.delivery.volume.score +
          result.delivery.pitch_melody.score +
          result.delivery.tonality.score +
          result.delivery.pausing.score) /
        5
      ).toFixed(1)}/10, presence=eye:${result.presence.eye_contact_score}/face:${result.presence.facial_expressiveness_score}, ` +
      `archetype=${result.combined.archetype_detected}, overall=${result.combined.overall_score}/10`,
  );
  return result;
}

export async function transcribeSession(
  videoUri: string,
  context: GradingContext,
  onProgress?: (step: TranscribeProgressStep) => void,
): Promise<GeminiSessionAnalysis> {
  logger.info(`[gemini] starting analysis for ${videoUri}`);
  const uploaded = await uploadVideoForGrading(videoUri, onProgress);
  return analyzeUploadedVideo(uploaded, context, onProgress);
}

// For sessions that don't want AI grading — just the two transcripts, no rubric.
export async function transcribeOnly(
  videoUri: string,
  onProgress?: (step: TranscribeProgressStep) => void,
): Promise<GeminiTranscriptOnly> {
  logger.info(`[gemini] starting transcript-only pass for ${videoUri}`);

  const uploaded = await uploadAndWaitForActive(videoUri, onProgress);

  onProgress?.("transcribing");
  logger.info("[gemini] calling generateContent (transcript-only)...");
  const responseText = await generateContent({
    fileUri: uploaded.uri,
    mimeType: "video/mp4",
    systemPrompt: buildTranscriptOnlySystemPrompt(),
    responseSchema: TRANSCRIPT_ONLY_SCHEMA,
    mediaResolution: "MEDIA_RESOLUTION_LOW",
  });
  logger.info(`[gemini] generateContent returned ${responseText.length} chars`);

  const result = parseTranscriptOnly(responseText);
  logger.info(
    `[gemini] parsed OK (transcript-only): verbatim=${result.transcript_verbatim.length} chars, ` +
      `clean=${result.transcript_clean.length} chars, duration=${result.duration_seconds}s`,
  );
  return result;
}

export function parseTranscriptOnly(responseText: string): GeminiTranscriptOnly {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch (error) {
    throw new GeminiApiError(`Gemini response was not valid JSON: ${(error as Error).message}`);
  }

  return extractTranscriptFields(parsed as Partial<GeminiTranscriptOnly>, parsed);
}

function isScoredNote(value: unknown): value is { score: number; notes: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { score?: unknown }).score === "number" &&
    typeof (value as { notes?: unknown }).notes === "string"
  );
}

const ANNOTATION_CATEGORIES: readonly AnnotationCategory[] = [
  "structure",
  "delivery",
  "presence",
  "content",
  "restated_point",
];

function isTranscriptAnnotation(value: unknown): value is TranscriptAnnotation {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<TranscriptAnnotation>;
  return (
    typeof candidate.quote === "string" &&
    typeof candidate.note === "string" &&
    typeof candidate.category === "string" &&
    (ANNOTATION_CATEGORIES as string[]).includes(candidate.category)
  );
}

export function parseGeminiSessionAnalysis(responseText: string): GeminiSessionAnalysis {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch (error) {
    throw new GeminiApiError(`Gemini response was not valid JSON: ${(error as Error).message}`);
  }

  const candidate = parsed as Partial<GeminiSessionAnalysis>;
  const transcriptFields = extractTranscriptFields(candidate, parsed);

  const structure = candidate.structure;
  if (
    !structure ||
    typeof structure.score !== "number" ||
    typeof structure.structure_used !== "string" ||
    typeof structure.notes !== "string"
  ) {
    throw new GeminiApiError("Gemini response JSON did not match the expected schema (structure)", undefined, parsed);
  }

  const content = candidate.content;
  if (
    !content ||
    typeof content.relevance_score !== "number" ||
    typeof content.relevance_notes !== "string" ||
    typeof content.coherence_score !== "number" ||
    typeof content.coherence_notes !== "string"
  ) {
    throw new GeminiApiError("Gemini response JSON did not match the expected schema (content)", undefined, parsed);
  }

  const delivery = candidate.delivery;
  if (
    !delivery ||
    !isScoredNote(delivery.rate) ||
    typeof delivery.rate.wpm_avg !== "number" ||
    !isScoredNote(delivery.volume) ||
    !isScoredNote(delivery.pitch_melody) ||
    !isScoredNote(delivery.tonality) ||
    !isScoredNote(delivery.pausing)
  ) {
    throw new GeminiApiError("Gemini response JSON did not match the expected schema (delivery)", undefined, parsed);
  }

  const presence = candidate.presence;
  if (
    !presence ||
    typeof presence.eye_contact_score !== "number" ||
    typeof presence.facial_expressiveness_score !== "number" ||
    typeof presence.body_language_notes !== "string"
  ) {
    throw new GeminiApiError("Gemini response JSON did not match the expected schema (presence)", undefined, parsed);
  }

  const combined = candidate.combined;
  if (
    !combined ||
    typeof combined.face_voice_congruence_score !== "number" ||
    typeof combined.archetype_detected !== "string" ||
    typeof combined.archetype_fit_for_topic !== "string" ||
    typeof combined.overall_score !== "number"
  ) {
    throw new GeminiApiError("Gemini response JSON did not match the expected schema (combined)", undefined, parsed);
  }

  const coaching = candidate.coaching;
  if (
    !coaching ||
    typeof coaching.summary !== "string" ||
    typeof coaching.top_strength !== "string" ||
    typeof coaching.top_focus_area !== "string" ||
    typeof coaching.recommended_drill !== "string"
  ) {
    throw new GeminiApiError("Gemini response JSON did not match the expected schema (coaching)", undefined, parsed);
  }

  const rawAnnotations = candidate.annotations;
  if (!Array.isArray(rawAnnotations) || !rawAnnotations.every(isTranscriptAnnotation)) {
    throw new GeminiApiError("Gemini response JSON did not match the expected schema (annotations)", undefined, parsed);
  }
  const annotations: TranscriptAnnotation[] = rawAnnotations;

  // Only present (and only required by the schema) when grading a
  // script_practice session recorded with cues enabled — absent otherwise.
  const cueCompliance = candidate.cue_compliance;
  if (cueCompliance !== undefined && !isScoredNote(cueCompliance)) {
    throw new GeminiApiError("Gemini response JSON did not match the expected schema (cue_compliance)", undefined, parsed);
  }

  return {
    ...transcriptFields,
    structure,
    content,
    delivery,
    presence,
    combined,
    annotations,
    coaching,
    // Checked later (acceptQuickCoach): a bad coach card never fails the review.
    ...(candidate.quick_coach !== undefined ? { quick_coach: candidate.quick_coach } : {}),
    ...(cueCompliance ? { cue_compliance: cueCompliance } : {}),
  };
}
