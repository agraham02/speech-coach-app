import { File } from "expo-file-system";
import { getAssemblyAiApiKey } from "../secrets/secretsStore";
import { logger } from "../../utils/logger";

// Opt-in, off-by-default cloud transcription — the only paid element in
// Phase 2's audio pipeline (see SettingsScreen.tsx's toggle). Mirrors
// geminiClient.ts's raw-fetch shape; no SDK needed for this small a surface.
const API_BASE = "https://api.assemblyai.com/v2";

export class AssemblyAiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "AssemblyAiError";
  }
}

export interface AssemblyAiWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface AssemblyAiTranscriptResult {
  id: string;
  text: string;
  words: AssemblyAiWord[];
  audioDurationSeconds: number;
}

async function authHeader(): Promise<Record<string, string>> {
  const key = await getAssemblyAiApiKey();
  if (!key) {
    throw new AssemblyAiError("No AssemblyAI API key set — add one in Settings under Cloud transcription.");
  }
  return { authorization: key };
}

// AssemblyAI accepts the raw video file directly (mp4 explicitly supported)
// and extracts the audio track server-side — no on-device extraction needed.
async function uploadFile(videoUri: string): Promise<string> {
  const headers = await authHeader();
  const file = new File(videoUri);
  const result = await file.upload(`${API_BASE}/upload`, { httpMethod: "POST", headers });

  if (result.status < 200 || result.status >= 300) {
    throw new AssemblyAiError(`AssemblyAI upload failed (${result.status})`, result.status);
  }
  const parsed = JSON.parse(result.body) as { upload_url: string };
  return parsed.upload_url;
}

// disfluencies: true is the actual accuracy lever here — keeps "um"/"uh" and
// literal repetitions ("my my my") in the transcript instead of silently
// normalizing them away, which is what makes this worth paying for over the
// free on-device path.
async function createTranscript(audioUrl: string): Promise<string> {
  const headers = await authHeader();
  const response = await fetch(`${API_BASE}/transcript`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ audio_url: audioUrl, disfluencies: true, punctuate: true, format_text: true }),
  });
  if (!response.ok) {
    throw new AssemblyAiError(`AssemblyAI create transcript failed (${response.status})`, response.status);
  }
  const data = (await response.json()) as { id: string };
  return data.id;
}

interface AssemblyAiPollResponse {
  status: "queued" | "processing" | "completed" | "error";
  text: string | null;
  words: { text: string; start: number; end: number }[] | null;
  audio_duration: number | null;
  error: string | null;
}

async function pollTranscript(
  id: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<AssemblyAiPollResponse> {
  const headers = await authHeader();
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const intervalMs = opts.intervalMs ?? 3000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await fetch(`${API_BASE}/transcript/${id}`, { headers });
    if (!response.ok) {
      throw new AssemblyAiError(`AssemblyAI poll failed (${response.status})`, response.status);
    }
    const data = (await response.json()) as AssemblyAiPollResponse;
    if (data.status === "completed") return data;
    if (data.status === "error") {
      throw new AssemblyAiError(`AssemblyAI transcription error: ${data.error ?? "unknown"}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new AssemblyAiError(`Timed out waiting for AssemblyAI transcript ${id}`);
}

export async function transcribeWithAssemblyAi(videoUri: string): Promise<AssemblyAiTranscriptResult> {
  logger.info("[assemblyai] uploading video...");
  const uploadUrl = await uploadFile(videoUri);
  const id = await createTranscript(uploadUrl);
  logger.info(`[assemblyai] transcript job ${id} created, polling...`);
  const data = await pollTranscript(id);

  const words: AssemblyAiWord[] = (data.words ?? []).map((w) => ({
    text: w.text,
    startMs: w.start,
    endMs: w.end,
  }));

  logger.info(`[assemblyai] transcribed ${data.text?.length ?? 0} chars, ${words.length} words`);
  return { id, text: data.text ?? "", words, audioDurationSeconds: (data.audio_duration ?? 0) };
}
