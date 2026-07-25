import { File } from "expo-file-system";
import { env } from "../../config/env";
import { GeminiApiError, type UploadedGeminiFile } from "./types";

const API_BASE = "https://generativelanguage.googleapis.com";
const MODEL = "gemini-flash-latest";

function apiKeyQuery(): string {
  return `key=${encodeURIComponent(env.geminiApiKey)}`;
}

// Step 1 of the resumable upload protocol: tells Gemini a file is coming and
// gets back an upload session URL to stream bytes to.
async function startResumableUpload(
  fileSizeBytes: number,
  mimeType: string,
  displayName: string,
): Promise<string> {
  const response = await fetch(`${API_BASE}/upload/v1beta/files?${apiKeyQuery()}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(fileSizeBytes),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });

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
  const result = await file.upload(uploadUrl, {
    httpMethod: "POST",
    mimeType,
    headers: {
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
    },
  });

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
    const response = await fetch(`${API_BASE}/v1beta/${fileName}?${apiKeyQuery()}`);
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

export async function generateContent(args: {
  fileUri: string;
  mimeType: string;
  systemPrompt: string;
  responseSchema: object;
  mediaResolution?: "MEDIA_RESOLUTION_LOW" | "MEDIA_RESOLUTION_MEDIUM";
}): Promise<string> {
  const response = await fetch(
    `${API_BASE}/v1beta/models/${MODEL}:generateContent?${apiKeyQuery()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { file_data: { file_uri: args.fileUri, mime_type: args.mimeType } },
              { text: args.systemPrompt },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: args.responseSchema,
          mediaResolution: args.mediaResolution ?? "MEDIA_RESOLUTION_LOW",
        },
      }),
    },
  );

  if (!response.ok) {
    throw new GeminiApiError(
      `Gemini generateContent failed (${response.status})`,
      response.status,
      await response.text().catch(() => undefined),
    );
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    throw new GeminiApiError("Gemini response did not include text content", undefined, data);
  }
  return text;
}
