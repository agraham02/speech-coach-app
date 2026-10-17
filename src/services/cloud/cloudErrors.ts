import { GeminiApiError } from "../gemini/types";
import { TimeoutError } from "../../utils/fetchWithTimeout";
import { readRateLimit } from "../gemini/responseHandling";

// A failed call to a deep-review provider (OpenAI, Claude, OpenRouter —
// Gemini has its own GeminiApiError).
export class CloudApiError extends Error {
  constructor(
    public readonly providerName: string,
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "CloudApiError";
  }
}

// The provider's own explanation, when its error body has one — most useful
// for a mistyped model ID ("model not found").
function providerMessage(body: unknown): string | null {
  let parsed = body;
  if (typeof body === "string") {
    try {
      parsed = JSON.parse(body);
    } catch {
      return body.trim().slice(0, 160) || null;
    }
  }
  const error = (parsed as { error?: { message?: unknown } | string } | null)?.error;
  const message = typeof error === "string" ? error : error?.message;
  return typeof message === "string" && message.trim() ? message.trim().slice(0, 200) : null;
}

// A failed deep review, worded for the person who has to fix it.
export function describeCloudError(error: unknown): string {
  const named = error instanceof CloudApiError ? error.providerName : error instanceof GeminiApiError ? "Gemini" : null;
  if (named && (error instanceof CloudApiError || error instanceof GeminiApiError)) {
    const { status, body } = error;
    const detail = providerMessage(body);
    if (status === 401 || status === 403 || (status === 400 && detail && /api key/i.test(detail))) {
      return `${named} didn't accept your API key. Check it in Settings → Deep reviews.`;
    }
    if (status === 402) return `Your ${named} account is out of credit. Top it up, then retry.`;
    if (status === 429 && readRateLimit(body).dailyQuota) {
      return `This ${named} key has used up today's quota. It resets tomorrow, or switch to a paid key in Settings → Deep reviews.`;
    }
    if (status === 429) return `${named} is rate-limiting this key (or it's out of quota). Wait a few minutes and retry.`;
    if (status !== undefined && status >= 500) return `${named}'s servers had a temporary problem. This usually works on retry.`;
    if (status === 404) return `${named} doesn't know that model${detail ? ` (${detail})` : ""}. Check the model in Settings → Deep reviews.`;
    if (status !== undefined && status >= 400) {
      return `${named} couldn't run this review${detail ? `: ${detail}` : ""}. Check the model in Settings, or retry.`;
    }
    return error.message;
  }
  if (error instanceof TimeoutError) return `${error.message}. Check your connection and retry.`;
  if (error instanceof TypeError) return "Couldn't reach the AI provider — check your internet connection and try again.";
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}
