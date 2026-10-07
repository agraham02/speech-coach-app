import { decodeVideoAudio, type DecodedAudio } from "../../../domain/audioAnalysis";
import { runHeavy } from "../jobQueue";

// The transcript and voice-analysis steps both need the decoded waveform.
// Keep the most recent decode so a normal run decodes once, while still
// holding only one waveform in memory.
let cached: { videoUri: string; promise: Promise<DecodedAudio | null> } | null = null;

export function getDecodedAudio(videoUri: string): Promise<DecodedAudio | null> {
  if (cached?.videoUri === videoUri) return cached.promise;
  const promise = runHeavy(() => decodeVideoAudio(videoUri));
  cached = { videoUri, promise };
  return promise;
}

export function clearDecodedAudio(): void {
  cached = null;
}
