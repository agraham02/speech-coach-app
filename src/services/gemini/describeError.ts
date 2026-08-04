import { GeminiApiError } from "./types";

// Turns a raw GeminiApiError/network failure into a message worth showing a
// user, instead of the internal technical string (e.g. "Gemini
// generateContent failed (429)") they'd otherwise see verbatim. Schema-shape
// GeminiApiErrors (from transcribeSession.ts's response validation) carry no
// status and fall through to the final branch — those are genuinely
// unexpected and the raw message is already the most useful thing to show.
export function describeGeminiError(error: unknown): string {
  if (error instanceof GeminiApiError) {
    if (error.status === 429) {
      return "You've hit the Gemini API rate limit. Wait a few minutes and try again.";
    }
    if (error.status !== undefined && error.status >= 500) {
      return "Gemini's servers had a temporary issue. This usually works on retry.";
    }
    if (error.status !== undefined && error.status >= 400) {
      return "Gemini couldn't process this recording — it may be too long or an unsupported format. Try again or re-record.";
    }
  }
  if (error instanceof TypeError) {
    return "Couldn't reach Gemini — check your internet connection and try again.";
  }
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}
