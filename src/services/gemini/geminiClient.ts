import { File } from "expo-file-system";
import { getGeminiApiKey } from "../secrets/secretsStore";
import { GeminiApiError, type UploadedGeminiFile } from "./types";
import { fetchWithTimeout, withDeadline } from "../../utils/fetchWithTimeout";
import { logger } from "../../utils/logger";
import { modelFor } from "../cloud/providers";
import { usageFromGemini, type TokenUsage } from "../../domain/cloudUsage";
import { extractResponseText, rateLimitRetryMs } from "./responseHandling";

const API_BASE = "https://generativelanguage.googleapis.com";
const SERVER_ERROR_RETRY_DELAYS_MS = [2_000, 6_000, 15_000];
// A per-minute rate limit (common on the free tier) clears in seconds.
const RATE_LIMIT_RETRIES = 2;

async function apiKeyQuery(): Promise<string> {
  const key = await getGeminiApiKey();
  if (!key) {
    throw new GeminiApiError("No Gemini API key set — add one in Settings → Deep reviews.");
  }
  return `key=${encodeURIComponent(key)}`;
}

// Step 1 of the resumable upload protocol: tells Gemini a file is coming and
// gets back an upload session URL to stream bytes to.
async function startResumableUpload(
  fileSizeBytes: number,
  mimeType: string,
  displayName: string,
): Promise<string> {
  const response = await fetchWithTimeout(`${API_BASE}/upload/v1beta/files?${await apiKeyQuery()}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(fileSizeBytes),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  }, 30_000, "Starting the Gemini upload");

  if (!response.ok) {
    throw new GeminiApiError(
      `Failed to start resumable upload (${response.status})`,
      response.status,
      await response.text().catch(() => undefined),
    );
  }

  const uploadUrl = response.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new GeminiApiError("Gemini did not return an x-goog-upload-url header");
  }
  return uploadUrl;
}

// Step 2: streams the file bytes straight from disk (never buffered fully in
// JS memory) to the upload session URL obtained above.
async function uploadBytes(
  uploadUrl: string,
  fileUri: string,
  mimeType: string,
): Promise<UploadedGeminiFile> {
  const file = new File(fileUri);
  const result = await withDeadline(file.upload(uploadUrl, {
    httpMethod: "POST",
    mimeType,
    headers: {
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
    },
  }), 10 * 60_000, "Uploading the video to Gemini");

  if (result.status < 200 || result.status >= 300) {
    throw new GeminiApiError(
      `Gemini file upload failed (${result.status})`,
      result.status,
      result.body,
    );
  }

  const parsed = JSON.parse(result.body) as { file: UploadedGeminiFile };
  return parsed.file;
}

export async function uploadVideoFile(
  fileUri: string,
  mimeType: string,
  displayName: string,
): Promise<UploadedGeminiFile> {
  const fileSizeBytes = new File(fileUri).size;
  const uploadUrl = await startResumableUpload(fileSizeBytes, mimeType, displayName);
  return uploadBytes(uploadUrl, fileUri, mimeType);
}

export async function waitForFileActive(
  fileName: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const intervalMs = opts.intervalMs ?? 3000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await fetchWithTimeout(`${API_BASE}/v1beta/${fileName}?${await apiKeyQuery()}`, {}, 15_000, "Checking the Gemini upload");
    if (!response.ok) {
      throw new GeminiApiError(
        `Failed to poll file status (${response.status})`,
        response.status,
      );
    }
    const data = (await response.json()) as UploadedGeminiFile;
    if (data.state === "ACTIVE") {
      return;
    }
    if (data.state === "FAILED") {
      throw new GeminiApiError(`Gemini file processing failed for ${fileName}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new GeminiApiError(`Timed out waiting for ${fileName} to become ACTIVE`);
}

// A single-shot re-use check for a *previously* uploaded file, as opposed to
// waitForFileActive's polling loop (which assumes the file is expected to
// still be actively processing and throws if it isn't). Returns false for
// anything other than a confirmed ACTIVE state — expired, deleted, failed,
// or a network error — so callers can always safely fall through to a fresh
// upload instead of surfacing a reuse-check failure as a session-level error.
export async function checkExistingFileActive(fileName: string): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(`${API_BASE}/v1beta/${fileName}?${await apiKeyQuery()}`, {}, 15_000, "Checking the Gemini upload");
    if (!response.ok) return false;
    const data = (await response.json()) as UploadedGeminiFile;
    return data.state === "ACTIVE";
  } catch {
    return false;
  }
}

// fileUri/mimeType are optional — omitting both fires a text-only call (no
// video ever leaves the device), used for the grounded/no-grading path where
// an on-device transcript already exists and Gemini is only
// asked to produce transcript_clean (see transcribeSession.ts). mediaResolution
// is only meaningful when actual media is attached, so it's omitted for
// text-only calls rather than sent as a no-op.
export async function generateContent(args: {
  fileUri?: string;
  mimeType?: string;
  systemPrompt: string;
  responseSchema: object;
  mediaResolution?: "MEDIA_RESOLUTION_LOW" | "MEDIA_RESOLUTION_MEDIUM";
  // Told how many tokens the call used, as Gemini reports it.
  onUsage?: (usage: TokenUsage) => void;
}): Promise<string> {
  const hasMedia = !!args.fileUri && !!args.mimeType;
  const parts: object[] = hasMedia
    ? [{ file_data: { file_uri: args.fileUri, mime_type: args.mimeType } }, { text: args.systemPrompt }]
    : [{ text: args.systemPrompt }];

  const url = `${API_BASE}/v1beta/models/${encodeURIComponent(modelFor("gemini"))}:generateContent?${await apiKeyQuery()}`;
  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: args.responseSchema,
      ...(hasMedia ? { mediaResolution: args.mediaResolution ?? "MEDIA_RESOLUTION_LOW" } : {}),
    },
  });

  // 5xx (mostly 503 "model overloaded") is Gemini-side and usually clears
  // within seconds, so it's retried here instead of failing the whole step.
  // So is a short per-minute rate limit (429); a daily quota is not.
  let response: Response;
  let serverRetries = 0;
  let rateLimitRetries = 0;
  for (;;) {
    response = await fetchWithTimeout(
      url,
      { method: "POST", headers: { "Content-Type": "application/json" }, body },
      hasMedia ? 180_000 : 45_000,
      "Gemini analysis",
    );
    let delayMs: number | null = null;
    if (response.status === 429 && rateLimitRetries < RATE_LIMIT_RETRIES) {
      delayMs = rateLimitRetryMs(await response.clone().text().catch(() => ""), response.headers.get("retry-after"));
      if (delayMs !== null) rateLimitRetries += 1;
    } else if (response.status >= 500 && serverRetries < SERVER_ERROR_RETRY_DELAYS_MS.length) {
      const retryAfterSeconds = Number(response.headers.get("retry-after"));
      delayMs = retryAfterSeconds > 0 ? Math.min(retryAfterSeconds * 1000, 30_000) : SERVER_ERROR_RETRY_DELAYS_MS[serverRetries];
      serverRetries += 1;
    }
    if (delayMs === null) break;
    const waitMs = delayMs;
    logger.warn(`[gemini] generateContent ${response.status}, retrying in ${Math.round(waitMs / 1000)}s`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  if (!response.ok) {
    throw new GeminiApiError(
      `Gemini generateContent failed (${response.status})`,
      response.status,
      await response.text().catch(() => undefined),
    );
  }

  const data = await response.json();
  const usage = usageFromGemini(data?.usageMetadata);
  if (usage) args.onUsage?.(usage);
  const answer = extractResponseText(data);
  if (!answer.ok) {
    logger.warn(`[gemini] no usable answer: ${answer.reason}`);
    throw new GeminiApiError(answer.reason, undefined, data);
  }
  return answer.text;
}
