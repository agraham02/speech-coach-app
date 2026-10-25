import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../../config/backend";
import type { TonoAllowance } from "../../domain/aiAllowance";
import { fetchWithTimeout, TimeoutError } from "../../utils/fetchWithTimeout";
import { getSupabase } from "../account/supabaseClient";
import { TonoApiError } from "./tonoError";
import { refuseTonoCallWhenMocked } from "../dev/mockAccount";

export { isDenyCode, TonoApiError } from "./tonoError";

// The app's only door to Tono's server (supabase/functions). Every call carries
// the signed-in person's token; the server decides what is allowed. Nothing
// here knows a model name or holds a key.

// Told every time a response carries the person's allowance, so the screens
// that show "49 of 60 judged takes left" never need a second request.
let allowanceListener: ((allowance: TonoAllowance) => void) | null = null;
export function onAllowance(listener: ((allowance: TonoAllowance) => void) | null): void {
  allowanceListener = listener;
}

async function accessToken(): Promise<string> {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new TonoApiError(401, "signed_out");
  return token;
}

interface ErrorBody {
  error?: { code?: unknown; message?: unknown; allowance?: TonoAllowance };
}

async function call<T>(fn: string, body: unknown, timeoutMs: number): Promise<T> {
  // Dev builds with a mock account: refused here, before any request is made.
  refuseTonoCallWhenMocked(fn);
  // A 401 may only mean the token aged out between getSession and the server:
  // refresh once and try again.
  for (let attempt = 0; ; attempt++) {
    const token = await accessToken();
    const response = await fetchWithTimeout(
      `${SUPABASE_URL}/functions/v1/${fn}`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, apikey: SUPABASE_PUBLISHABLE_KEY, "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      },
      timeoutMs,
      "Tono AI",
    );
    const text = await response.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (response.ok) {
      const allowance = (json as { allowance?: TonoAllowance } | null)?.allowance;
      if (allowance) allowanceListener?.(allowance);
      return json as T;
    }
    if (response.status === 401 && attempt === 0) {
      await getSupabase().auth.refreshSession().catch(() => undefined);
      continue;
    }
    const error = (json as ErrorBody | null)?.error ?? {};
    if (error.allowance) allowanceListener?.(error.allowance);
    throw new TonoApiError(
      response.status,
      typeof error.code === "string" ? error.code : `http_${response.status}`,
      typeof error.message === "string" ? error.message : undefined,
      error.allowance,
    );
  }
}

// A function whose answer streams (ai-converse): hands each piece of the body
// to `onText` as it arrives. Where the fetch can't stream, the whole body
// arrives as one piece at the end, which still works, only later. A refusal
// (a non-2xx status) throws TonoApiError as call() does. `idleMs`: give up
// when nothing has arrived for that long; `signal` cancels (the person ended
// the conversation).
export async function tonoStream(fn: string, body: unknown, onText: (text: string) => void, options: { idleMs: number; signal?: AbortSignal }): Promise<void> {
  refuseTonoCallWhenMocked(fn);
  for (let attempt = 0; ; attempt++) {
    const token = await accessToken();
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => controller.abort(), options.idleMs);
    };
    arm();
    try {
      // On iOS and Android the global fetch is expo/fetch, which streams.
      const response = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, apikey: SUPABASE_PUBLISHABLE_KEY, "content-type": "application/json", accept: "application/x-ndjson" },
        body: JSON.stringify(body ?? {}),
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status === 401 && attempt === 0) {
          await getSupabase().auth.refreshSession().catch(() => undefined);
          continue;
        }
        const text = await response.text().catch(() => "");
        let error: NonNullable<ErrorBody["error"]> = {};
        try {
          error = ((text ? JSON.parse(text) : null) as ErrorBody | null)?.error ?? {};
        } catch {
          error = {};
        }
        if (error.allowance) allowanceListener?.(error.allowance);
        throw new TonoApiError(
          response.status,
          typeof error.code === "string" ? error.code : `http_${response.status}`,
          typeof error.message === "string" ? error.message : undefined,
          error.allowance,
        );
      }
      const reader = (response.body as ReadableStream<Uint8Array> | null)?.getReader?.();
      if (!reader) {
        onText(await response.text());
        return;
      }
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        arm();
        if (value?.length) onText(decoder.decode(value, { stream: true }));
      }
      return;
    } catch (error) {
      if (controller.signal.aborted && !options.signal?.aborted) throw new TimeoutError("Tono AI", options.idleMs);
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  }
}

// An allowance learned some other way (a streamed answer's last event).
export function reportAllowance(allowance: TonoAllowance): void {
  allowanceListener?.(allowance);
}

export interface MeResponse {
  allowance: TonoAllowance;
  mode: "beta" | "launch";
  allowed: { take: boolean; text: boolean; insight: boolean; conversation?: boolean };
  killSwitch: boolean;
  // The launch switch (server config): whether Tono Plus is for sale.
  plusPurchasable: boolean;
  // Whether someone who said they are under 18 may use Tono AI.
  minorsMayUseAi: boolean;
}

export interface UploadStartResponse {
  uploadUrl: string;
  uploadId: string;
}

export interface FileStatusResponse {
  name: string;
  uri: string;
  mimeType: string;
  state: string;
}

// The tasks the server runs (supabase/functions/_shared/prompts). The phone
// names one and sends its structured inputs; the server writes the prompt.
export type TonoTask = "take_review" | "rewind_notes" | "word_chain" | "bridge_chain" | "summary_notes" | "mark_up" | "conversation_debrief";

export interface GenerateRequest {
  task: TonoTask;
  // The answer format this app reads; the server refuses any other.
  schemaVersion: number;
  inputs: object;
  // A take review that should watch the video: its uploaded file.
  media?: { fileName: string; videoSeconds: number };
  // One per attempt, so a retried request cannot be counted twice.
  idempotencyKey: string;
}

export interface GenerateResponse {
  // The answer as JSON, in the task's format. The app checks it.
  output: unknown;
  model: string;
  usedFallback: boolean;
  promptVersion: string;
  schemaVersion: number;
  // Gemini's token counts (usageMetadata), for the app's usage record.
  usage: unknown;
  allowance: TonoAllowance;
}

// `refresh`: ask the server to check the subscription with RevenueCat now,
// rather than trust what it last saw (after a purchase or a restore).
export const tonoMe = (options?: { refresh?: boolean }) => call<MeResponse>("me", options?.refresh ? { refresh: true } : {}, 25_000);

export const tonoUploadStart = (args: { sizeBytes: number; mimeType: string }) => call<UploadStartResponse>("ai-upload-start", args, 30_000);

export const tonoFileStatus = (fileName: string) => call<FileStatusResponse>("ai-file", { fileName }, 20_000);

// Removes a take's uploaded video from Google (when the take is deleted).
export const tonoDeleteFile = (fileName: string) => call<{ ok: true }>("ai-file", { fileName, delete: true }, 20_000);

// A take judged from its video waits for Google to watch it; text is quick.
export const tonoGenerate = (request: GenerateRequest, timeoutMs = request.media ? 190_000 : 70_000) => call<GenerateResponse>("ai-generate", request, timeoutMs);

// The server's switches, before there is any account (no token sent).
export interface AppConfigResponse {
  mode: "beta" | "launch";
  killSwitch: boolean;
  plusPurchasable: boolean;
  minorsMayUseAi: boolean;
  freeMonthlyJudgedTakes: number;
}

export async function tonoAppConfig(): Promise<AppConfigResponse> {
  refuseTonoCallWhenMocked("app-config");
  const response = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/app-config`, { method: "GET", headers: { apikey: SUPABASE_PUBLISHABLE_KEY } }, 15_000, "Tono");
  if (!response.ok) throw new TonoApiError(response.status, `http_${response.status}`);
  return (await response.json()) as AppConfigResponse;
}

export const tonoAppleToken = (authorizationCode: string) => call<{ ok: true }>("apple-token", { authorizationCode }, 30_000);

export const tonoDeleteAccount = () => call<{ ok: true }>("delete-account", {}, 40_000);
