import { generateContent, uploadVideoFile, waitForFileActive } from "./geminiClient";
import { buildSystemPrompt, RESPONSE_SCHEMA } from "./schema";
import { GeminiApiError, type GeminiSessionAnalysis } from "./types";
import { logger } from "../../utils/logger";

export type TranscribeProgressStep =
  | "uploading"
  | "processing"
  | "transcribing";

export async function transcribeSession(
  videoUri: string,
  promptText: string,
  onProgress?: (step: TranscribeProgressStep) => void,
): Promise<GeminiSessionAnalysis> {
  logger.info(`[gemini] starting analysis for ${videoUri}`);

  onProgress?.("uploading");
  logger.info("[gemini] uploading video file...");
  const uploaded = await uploadVideoFile(videoUri, "video/mp4", `session-${Date.now()}.mp4`);
  logger.info(`[gemini] upload complete: ${uploaded.name} (state=${uploaded.state})`);

  onProgress?.("processing");
  logger.info(`[gemini] waiting for ${uploaded.name} to become ACTIVE...`);
  await waitForFileActive(uploaded.name);
  logger.info(`[gemini] ${uploaded.name} is ACTIVE`);

  onProgress?.("transcribing");
  logger.info("[gemini] calling generateContent...");
  const responseText = await generateContent({
    fileUri: uploaded.uri,
    mimeType: "video/mp4",
    systemPrompt: buildSystemPrompt(promptText),
    responseSchema: RESPONSE_SCHEMA,
    mediaResolution: "MEDIA_RESOLUTION_LOW",
  });
  logger.info(`[gemini] generateContent returned ${responseText.length} chars`);

  const result = parseGeminiSessionAnalysis(responseText);
  logger.info(
    `[gemini] parsed OK: verbatim=${result.transcript_verbatim.length} chars, clean=${result.transcript_clean.length} chars, ` +
      `duration=${result.duration_seconds}s, structure=${result.structure.score}/10 (${result.structure.structure_used}), ` +
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

function isScoredNote(value: unknown): value is { score: number; notes: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { score?: unknown }).score === "number" &&
    typeof (value as { notes?: unknown }).notes === "string"
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

  const structure = candidate.structure;
  if (
    !structure ||
    typeof structure.score !== "number" ||
    typeof structure.structure_used !== "string" ||
    typeof structure.notes !== "string"
  ) {
    throw new GeminiApiError("Gemini response JSON did not match the expected schema (structure)", undefined, parsed);
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

  return {
    transcript_verbatim: candidate.transcript_verbatim,
    transcript_clean: candidate.transcript_clean,
    duration_seconds: candidate.duration_seconds,
    structure,
    delivery,
    presence,
    combined,
    coaching,
  };
}
