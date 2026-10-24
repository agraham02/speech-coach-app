// Bounds on what goes to Tono AI, so a pasted wall of text or a huge file is
// refused on the phone before it costs anything. The server has its own,
// stricter checks (supabase/functions/_shared/request.ts). Pure.

// About 50 minutes of speech: far past any take the app records.
export const MAX_REVIEW_WORDS = 8000;

// Google's Files API takes up to 2 GB; anything near that isn't a practice take.
export const MAX_REVIEW_VIDEO_BYTES = 1_000_000_000;

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
