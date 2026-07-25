import { generateContent, uploadVideoFile, waitForFileActive } from "./geminiClient";
import { buildSystemPrompt, PHASE1_RESPONSE_SCHEMA } from "./schema";
import { GeminiApiError, type GeminiPhase1Response } from "./types";
import { logger } from "../../utils/logger";

export type TranscribeProgressStep =
  | "uploading"
  | "processing"
  | "transcribing";

export async function transcribeSession(
  videoUri: string,
  promptText: string,
  onProgress?: (step: TranscribeProgressStep) => void,
): Promise<GeminiPhase1Response> {
  logger.info(`[gemini] starting transcription for ${videoUri}`);

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
    responseSchema: PHASE1_RESPONSE_SCHEMA,
    mediaResolution: "MEDIA_RESOLUTION_LOW",
  });
  logger.info(`[gemini] generateContent returned ${responseText.length} chars`);

  const result = parseGeminiPhase1Response(responseText);
  logger.info(
    `[gemini] parsed OK: verbatim=${result.transcript_verbatim.length} chars, clean=${result.transcript_clean.length} chars, duration=${result.duration_seconds}s`,
  );
  return result;
}

export function parseGeminiPhase1Response(responseText: string): GeminiPhase1Response {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch (error) {
    throw new GeminiApiError(`Gemini response was not valid JSON: ${(error as Error).message}`);
  }

  const candidate = parsed as Partial<GeminiPhase1Response>;
  if (
    typeof candidate.transcript_verbatim !== "string" ||
    typeof candidate.transcript_clean !== "string" ||
    typeof candidate.duration_seconds !== "number"
  ) {
    throw new GeminiApiError(
      "Gemini response JSON did not match the expected Phase 1 schema",
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
