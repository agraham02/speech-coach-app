import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../../config/backend";
import type { TonoAllowance } from "../../domain/aiAllowance";
import { fetchWithTimeout } from "../../utils/fetchWithTimeout";
import { getSupabase } from "../account/supabaseClient";
import { TonoApiError } from "./tonoError";

export { isDenyCode, TonoApiError } from "./tonoError";

// The app's only door to Tono's server (supabase/functions). Every call carries
// the signed-in person's token; the server decides what is allowed. Nothing
// here knows a model name or holds a key.

// Told every time a response carries the person's allowance, so the screens
// that show "3 of 5 free reviews left" never need a second request.
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

export interface MeResponse {
  allowance: TonoAllowance;
  mode: "beta" | "launch";
  allowed: { review: boolean; text: boolean; insight: boolean };
  killSwitch: boolean;
  // The launch switch (server config): whether Tono Plus is for sale.
  plusPurchasable?: boolean;
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

export interface GenerateRequest {
  kind: "review" | "text" | "insight";
  systemPrompt: string;
  schema: object;
  // A review only.
  fileName?: string;
  videoSeconds?: number;
  // One per attempt, so a retried request cannot be counted twice.
  idempotencyKey: string;
}

export interface GenerateResponse {
  // Gemini's own answer, parsed and checked by the app exactly as before.
  gemini: unknown;
  model: string;
  usedFallback: boolean;
  allowance: TonoAllowance;
}

// `refresh`: ask the server to check the subscription with RevenueCat now,
// rather than trust what it last saw (after a purchase or a restore).
export const tonoMe = (options?: { refresh?: boolean }) => call<MeResponse>("me", options?.refresh ? { refresh: true } : {}, 25_000);

export const tonoUploadStart = (args: { sizeBytes: number; mimeType: string }) => call<UploadStartResponse>("ai-upload-start", args, 30_000);

export const tonoFileStatus = (fileName: string) => call<FileStatusResponse>("ai-file", { fileName }, 20_000);

// Removes a take's uploaded video from Google (when the take is deleted).
export const tonoDeleteFile = (fileName: string) => call<{ ok: true }>("ai-file", { fileName, delete: true }, 20_000);

// A video review waits for Google to watch the video; text is quick.
export const tonoGenerate = (request: GenerateRequest) => call<GenerateResponse>("ai-generate", request, request.kind === "review" ? 190_000 : 70_000);

export const tonoAppleToken = (authorizationCode: string) => call<{ ok: true }>("apple-token", { authorizationCode }, 30_000);

export const tonoDeleteAccount = () => call<{ ok: true }>("delete-account", {}, 40_000);
