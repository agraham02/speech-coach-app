import { audioPiecesIn, base64ToBytes, pcmFromAudio, SseReader, ttsBody, ttsUsageIn, type TtsRequest } from "./tts.ts";

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

// Google's own words for a failure ("Invalid value at ..."), short enough to
// log and to show in the Dev tab. Never contains the key (it is sent in a
// header, and Google does not echo headers).
async function failureDetail(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const message = (JSON.parse(text) as { error?: { message?: unknown } }).error?.message;
    if (typeof message === "string") return message.replace(/\s+/g, " ").slice(0, 240);
  } catch {
    // not JSON
  }
  return text.replace(/\s+/g, " ").slice(0, 240);
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

  const send = (config: Record<string, unknown>) =>
    call(
      key,
      `/v1beta/models/${encodeURIComponent(args.model)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: config }),
      },
      args.file ? 170_000 : 60_000,
    );
  let res = await send(generationConfig);
  if (res.status === 400 && args.thinkingBudget !== undefined) {
    // Newer models steer thinking by level and may refuse a token budget
    // (or a budget of zero). Ask again with the model's own default.
    const detail = await failureDetail(res);
    if (!/think/i.test(detail)) throw new GeminiError(`generate 400: ${detail}`, 400, false);
    console.warn(`${args.model} refused the thinking budget (${detail}); asking again without it`);
    const { thinkingConfig: _dropped, ...rest } = generationConfig;
    res = await send(rest);
  }
  if (!res.ok) throw new GeminiError(`generate ${res.status}: ${await failureDetail(res)}`, res.status, isRetryable(res.status));

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

// ---- speech (the conversation partner's voice) ----

export interface SpeakResult {
  // Raw PCM bytes produced (24 kHz mono 16-bit).
  bytes: number;
  // Token counts if Google reported them; else the caller works them out
  // from the audio length (25 tokens a second).
  usage: { inputTokens: number; outputTokens: number } | null;
  // Time from sending the request to the first audio bytes.
  firstAudioMs: number | null;
  streamed: boolean;
}

// One line spoken through the Interactions API, streamed: each piece of PCM
// is handed to `onPcm` as it arrives. If the stream carries no audio (the
// event format differs from what tts.ts expects), it asks once more without
// streaming and hands over the whole line, so the person still hears it.
export async function speak(key: string, r: Omit<TtsRequest, "stream">, onPcm: (pcm: Uint8Array) => void, timeoutMs = 30_000): Promise<SpeakResult> {
  const started = Date.now();
  let firstAudioMs: number | null = null;
  let bytes = 0;
  let usage: SpeakResult["usage"] = null;
  const emit = (b64: string) => {
    const pcm = pcmFromAudio(base64ToBytes(b64));
    if (!pcm.length) return;
    if (firstAudioMs == null) firstAudioMs = Date.now() - started;
    bytes += pcm.length;
    onPcm(pcm);
  };

  const res = await call(
    key,
    "/v1beta/interactions",
    { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(ttsBody({ ...r, stream: true })) },
    timeoutMs,
  );
  if (!res.ok) throw new GeminiError(`speak ${res.status}: ${await failureDetail(res)}`, res.status, isRetryable(res.status));
  const contentType = res.headers.get("content-type") ?? "";
  if (res.body && contentType.includes("event-stream")) {
    const sse = new SseReader();
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      const events = done ? sse.end() : sse.push(decoder.decode(value, { stream: true }));
      for (const event of events) {
        for (const piece of audioPiecesIn(event)) emit(piece);
        usage = ttsUsageIn(event) ?? usage;
      }
      if (done) break;
    }
  } else {
    // Not a stream after all: one JSON interaction.
    const body = (await res.json().catch(() => null)) as unknown;
    for (const piece of audioPiecesIn(body)) emit(piece);
    usage = ttsUsageIn(body);
  }
  if (bytes > 0) return { bytes, usage, firstAudioMs, streamed: true };

  const unary = await call(key, "/v1beta/interactions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ttsBody({ ...r, stream: false })) }, timeoutMs);
  if (!unary.ok) throw new GeminiError(`speak ${unary.status}: ${await failureDetail(unary)}`, unary.status, isRetryable(unary.status));
  const body = (await unary.json()) as unknown;
  for (const piece of audioPiecesIn(body)) emit(piece);
  if (bytes === 0) throw new GeminiError("no audio", 502, true);
  return { bytes, usage: ttsUsageIn(body), firstAudioMs, streamed: false };
}
