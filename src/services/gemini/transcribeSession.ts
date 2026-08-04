import { generateContent, uploadVideoFile, waitForFileActive } from "./geminiClient";
import {
  buildResponseSchemaWithCueCompliance,
  buildScriptSystemPrompt,
  buildSystemPrompt,
  buildTranscriptOnlySystemPrompt,
  RESPONSE_SCHEMA,
  TRANSCRIPT_ONLY_SCHEMA,
} from "./schema";
import {
  GeminiApiError,
  type AnnotationCategory,
  type GeminiSessionAnalysis,
  type GeminiTranscriptOnly,
  type TranscriptAnnotation,
} from "./types";
import type { Script } from "../../domain/scriptTypes";
import { logger } from "../../utils/logger";

export type TranscribeProgressStep =
  | "uploading"
  | "processing"
  | "transcribing";

// Grading context for a session: either a spontaneous/free-record prompt, or
// a fixed Script Practice script (with whatever cuesEnabled was chosen at
// recording time). Determines which system prompt + response schema
// transcribeSession uses.
export type GradingContext =
  | { kind: "prompt"; promptText: string }
  | { kind: "script"; script: Script; cuesEnabled: boolean };

// Shared by transcribeSession and transcribeOnly: upload the recording to the
// Gemini Files API and wait for it to become ACTIVE before generateContent
// can reference it.
async function uploadAndWaitForActive(videoUri: string, onProgress?: (step: TranscribeProgressStep) => void) {
  onProgress?.("uploading");
  logger.info("[gemini] uploading video file...");
  const uploaded = await uploadVideoFile(videoUri, "video/mp4", `session-${Date.now()}.mp4`);
  logger.info(`[gemini] upload complete: ${uploaded.name} (state=${uploaded.state})`);

  onProgress?.("processing");
  logger.info(`[gemini] waiting for ${uploaded.name} to become ACTIVE...`);
  await waitForFileActive(uploaded.name);
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

export async function transcribeSession(
  videoUri: string,
  context: GradingContext,
  onProgress?: (step: TranscribeProgressStep) => void,
): Promise<GeminiSessionAnalysis> {
  logger.info(`[gemini] starting analysis for ${videoUri}`);

  const uploaded = await uploadAndWaitForActive(videoUri, onProgress);

  const systemPrompt =
    context.kind === "script"
      ? buildScriptSystemPrompt(context.script, context.cuesEnabled)
      : buildSystemPrompt(context.promptText);
  const showsCueCompliance =
    context.kind === "script" && context.cuesEnabled && context.script.cues.length > 0;
  const responseSchema = showsCueCompliance ? buildResponseSchemaWithCueCompliance() : RESPONSE_SCHEMA;

  onProgress?.("transcribing");
  logger.info("[gemini] calling generateContent...");
  const responseText = await generateContent({
    fileUri: uploaded.uri,
    mimeType: "video/mp4",
    systemPrompt,
    responseSchema,
    mediaResolution: "MEDIA_RESOLUTION_LOW",
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

const ANNOTATION_CATEGORIES: readonly AnnotationCategory[] = ["structure", "delivery", "presence", "content"];

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
    ...(cueCompliance ? { cue_compliance: cueCompliance } : {}),
  };
}
