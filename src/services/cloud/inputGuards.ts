import type { KeyProviderId } from "./providers";

// Guards on what goes into a deep review — the user's own key pays for
// every call, so the app refuses what can only waste money (a stuck retry
// loop, a pasted wall of text) and anything that could bend the request.
// Pure.

// Deep-review calls in a day. Generous for real practice; there to stop a
// stuck retry from running up a bill.
export const DAILY_REVIEW_LIMIT = 30;

// About 50 minutes of speech — far past any take the app records.
export const MAX_REVIEW_WORDS = 8000;

// Gemini's Files API takes up to 2 GB; anything near that isn't a practice take.
export const MAX_REVIEW_VIDEO_BYTES = 1_000_000_000;

export const MAX_KEY_LENGTH = 400;
export const MAX_MODEL_LENGTH = 100;

// Model IDs the providers use: "gpt-6.1-sol", "claude-sonnet-5-5",
// "anthropic/claude-sonnet-5.5", "gemini-flash-latest", "x:free". Nothing
// that could reshape a URL or a header.
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;

export function isValidModelId(id: string): boolean {
  return id.length <= MAX_MODEL_LENGTH && MODEL_ID.test(id) && !id.includes("..") && !id.includes("//");
}

// Keys never contain whitespace; pasting often adds some (a trailing
// newline, a space from a password manager).
export function cleanApiKey(raw: string): string {
  return raw.replace(/\s+/g, "").slice(0, MAX_KEY_LENGTH);
}

// The provider a key's prefix gives away, when it's distinctive enough to
// say — so a Claude key pasted under OpenAI gets a useful hint instead of a
// bare "rejected".
export function providerForKey(key: string): KeyProviderId | null {
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("sk-or-")) return "openrouter";
  if (key.startsWith("AIza")) return "gemini";
  if (key.startsWith("sk-")) return "openai";
  return null;
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

// Text placed between """ fences in a prompt: it can't close the fence
// early, and control characters go.
export function fenced(text: string): string {
  return text.replace(/"{3,}/g, '"').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

export function reviewsLeft(callsToday: number): number {
  return Math.max(0, DAILY_REVIEW_LIMIT - callsToday);
}
