// Reading what Gemini sends back: when a rate-limited call is worth waiting
// for, and getting the answer text out (or a clear reason there is none).
// Pure.

// Gemini names the limit that was hit. A per-minute one clears in seconds;
// a per-day one not until tomorrow, so retrying it only wastes time.
export interface RateLimitInfo {
  dailyQuota: boolean;
  retryDelayMs: number | null;
}

interface ErrorDetail {
  "@type"?: string;
  violations?: { quotaId?: string; quotaMetric?: string }[];
  retryDelay?: string;
}

function parseBody(body: unknown): { error?: { details?: ErrorDetail[] } } | null {
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  return (body as { error?: { details?: ErrorDetail[] } }) ?? null;
}

export function readRateLimit(body: unknown): RateLimitInfo {
  const details = parseBody(body)?.error?.details ?? [];
  let dailyQuota = false;
  let retryDelayMs: number | null = null;
  for (const detail of Array.isArray(details) ? details : []) {
    for (const v of detail.violations ?? []) {
      if (/per ?day/i.test(v.quotaId ?? "") || /per ?day/i.test(v.quotaMetric ?? "")) dailyQuota = true;
    }
    const delay = /^(\d+(?:\.\d+)?)s$/.exec(detail.retryDelay ?? "");
    if (delay) retryDelayMs = Math.round(Number(delay[1]) * 1000);
  }
  return { dailyQuota, retryDelayMs };
}

// Longer than this and the user is better off retrying later themselves.
export const MAX_RATE_LIMIT_WAIT_MS = 60_000;
const DEFAULT_RATE_LIMIT_WAIT_MS = 10_000;

// How long to wait before retrying a 429, or null when it should not be.
export function rateLimitRetryMs(body: unknown, retryAfterHeader: string | null): number | null {
  const { dailyQuota, retryDelayMs } = readRateLimit(body);
  if (dailyQuota) return null;
  const header = Number(retryAfterHeader);
  const delay = retryDelayMs ?? (header > 0 ? header * 1000 : DEFAULT_RATE_LIMIT_WAIT_MS);
  return delay <= MAX_RATE_LIMIT_WAIT_MS ? delay + 500 : null;
}

export type GeminiText = { ok: true; text: string } | { ok: false; reason: string };

interface GenerateResponse {
  promptFeedback?: { blockReason?: string };
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: unknown; thought?: boolean }[] };
  }[];
}

// The answer text from a generateContent response. Joins every text part
// (a long answer can arrive in more than one) and skips thought summaries.
export function extractResponseText(data: unknown): GeminiText {
  const response = (data ?? {}) as GenerateResponse;
  const blocked = response.promptFeedback?.blockReason;
  if (blocked) return { ok: false, reason: `Gemini refused the request (${blocked}).` };
  const candidate = response.candidates?.[0];
  if (!candidate) return { ok: false, reason: "Gemini sent back no answer. Retry." };
  const text = (candidate.content?.parts ?? [])
    .filter((p) => typeof p?.text === "string" && !p.thought)
    .map((p) => p.text as string)
    .join("");
  const finish = candidate.finishReason;
  // Cut off mid-answer: the JSON would not parse anyway, so say why.
  if (finish === "MAX_TOKENS") return { ok: false, reason: "Gemini ran out of room before finishing the review. Retry; a shorter take helps." };
  if (!text.trim()) {
    return { ok: false, reason: finish && finish !== "STOP" ? `Gemini stopped without an answer (${finish}). Retry.` : "Gemini sent back an empty answer. Retry." };
  }
  return { ok: true, text };
}
