// Gemini REST calls made by the server. The API key goes in a header and
// nowhere else, and an upload URL that contains the key is refused, so a key
// can never reach a phone.

const BASE = "https://generativelanguage.googleapis.com";

export class GeminiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryable: boolean,
  ) {
    super(message);
  }
}

// 404 is a retired or unknown model, 429 a quota, 5xx an outage: each is worth
// one try on the fallback model. Anything else (a bad schema, a blocked
// prompt) would fail the same way on the fallback.
function isRetryable(status: number): boolean {
  return status === 404 || status === 429 || status >= 500;
}

async function call(key: string, path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { ...(init.headers as Record<string, string> | undefined), "x-goog-api-key": key },
    });
  } catch (e) {
    throw new GeminiError(e instanceof Error ? e.message : "network", 0, true);
  } finally {
    clearTimeout(timer);
  }
}

// Step 1 of the resumable upload: tells Google a file is coming and returns
// the URL the phone streams the bytes to.
export async function startUpload(
  key: string,
  args: { sizeBytes: number; mimeType: string; displayName: string },
): Promise<string> {
  const res = await call(
    key,
    "/upload/v1beta/files",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(args.sizeBytes),
        "X-Goog-Upload-Header-Content-Type": args.mimeType,
      },
      body: JSON.stringify({ file: { display_name: args.displayName } }),
    },
    30_000,
  );
  if (!res.ok) throw new GeminiError(`start upload ${res.status}`, res.status, isRetryable(res.status));
  const uploadUrl = res.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new GeminiError("no upload url", 502, false);
  // Fail closed: if Google ever starts putting the key in the URL, nothing is
  // handed to a phone.
  if (uploadUrl.includes(key) || /[?&]key=/.test(uploadUrl)) {
    throw new GeminiError("upload url carries the api key", 502, false);
  }
  return uploadUrl;
}

export interface GeminiFile {
  name: string;
  displayName?: string;
  mimeType?: string;
  state?: string;
  uri?: string;
}

export async function getFile(key: string, name: string): Promise<GeminiFile | null> {
  const res = await call(key, `/v1beta/${name}`, { method: "GET" }, 15_000);
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new GeminiError(`get file ${res.status}`, res.status, isRetryable(res.status));
  return (await res.json()) as GeminiFile;
}

export async function deleteFile(key: string, name: string): Promise<void> {
  try {
    await call(key, `/v1beta/${name}`, { method: "DELETE" }, 15_000);
  } catch (e) {
    console.warn("delete file failed", e instanceof Error ? e.message : e);
  }
}

export function fileUri(name: string): string {
  return `${BASE}/v1beta/${name}`;
}

export interface GenerateArgs {
  model: string;
  systemPrompt: string;
  schema: Record<string, unknown>;
  file?: { name: string; mimeType: string };
  maxOutputTokens: number;
  thinkingBudget?: number;
  videoFps?: number;
}

export interface GenerateResult {
  body: Record<string, unknown>;
  text: string;
}

// One generateContent call. Throws GeminiError (retryable or not) for a bad
// status, a blocked prompt or an answer that did not finish.
export async function generate(key: string, args: GenerateArgs): Promise<GenerateResult> {
  const parts: Record<string, unknown>[] = [];
  if (args.file) {
    parts.push({
      fileData: { fileUri: fileUri(args.file.name), mimeType: args.file.mimeType },
      ...(args.videoFps ? { videoMetadata: { fps: args.videoFps } } : {}),
    });
  }
  parts.push({ text: args.systemPrompt });

  const generationConfig: Record<string, unknown> = {
    responseMimeType: "application/json",
    responseSchema: args.schema,
    maxOutputTokens: args.maxOutputTokens,
    ...(args.file ? { mediaResolution: "MEDIA_RESOLUTION_LOW" } : {}),
    ...(args.thinkingBudget !== undefined ? { thinkingConfig: { thinkingBudget: args.thinkingBudget } } : {}),
  };

  const res = await call(
    key,
    `/v1beta/models/${encodeURIComponent(args.model)}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig }),
    },
    args.file ? 170_000 : 60_000,
  );
  if (!res.ok) throw new GeminiError(`generate ${res.status}`, res.status, isRetryable(res.status));

  const body = (await res.json()) as Record<string, unknown>;
  const text = answerText(body);
  return { body, text };
}

// The answer text, or a GeminiError explaining why there is none. A truncated
// or blocked answer is retryable on the fallback model; the phone would only
// get unusable JSON from it.
export function answerText(body: Record<string, unknown>): string {
  const feedback = body.promptFeedback as { blockReason?: string } | undefined;
  if (feedback?.blockReason) throw new GeminiError(`blocked: ${feedback.blockReason}`, 422, false);
  const candidates = body.candidates as { finishReason?: string; content?: { parts?: { text?: string }[] } }[] | undefined;
  const first = candidates?.[0];
  if (!first) throw new GeminiError("no candidate", 502, true);
  if (first.finishReason && first.finishReason !== "STOP") {
    throw new GeminiError(`finish ${first.finishReason}`, 502, first.finishReason === "MAX_TOKENS");
  }
  const text = (first.content?.parts ?? []).map((p) => p.text ?? "").join("");
  if (!text.trim()) throw new GeminiError("empty answer", 502, true);
  return text;
}
