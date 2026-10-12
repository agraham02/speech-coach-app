import type { TranscriptWord, WpmPoint } from "./sessionTypes";

const BUCKET_SECONDS = 5;

// Buckets word-level timestamps into fixed 5-second windows and computes a
// words-per-minute rate for each — a real pace-over-time curve instead of
// the single averaged number Gemini's rate_wpm_avg already provides. Uses
// each word's start time to assign it to a bucket. Requires word-level
// timestamps (on-device ASR) — there's nothing to compute this
// from when only a Gemini self-transcription exists (no word array).
export function computeWpmCurve(words: TranscriptWord[], durationSeconds: number): WpmPoint[] {
  if (words.length === 0 || durationSeconds <= 0) return [];

  const bucketCount = Math.max(1, Math.ceil(durationSeconds / BUCKET_SECONDS));
  const counts = new Array(bucketCount).fill(0);
  for (const word of words) {
    const bucketIndex = Math.min(bucketCount - 1, Math.floor(word.startMs / 1000 / BUCKET_SECONDS));
    if (bucketIndex >= 0) counts[bucketIndex]++;
  }

  return counts.map((count, index) => ({
    bucketStartSeconds: index * BUCKET_SECONDS,
    wpm: Math.round((count / BUCKET_SECONDS) * 60),
  }));
}
