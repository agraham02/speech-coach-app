import { File } from "expo-file-system";
import { decodeVideoAudio } from "../../domain/audioAnalysis";
import { concatWaveforms } from "../../domain/rewind/wav";
import type { TimedWordInput } from "../../domain/drills/timedHeard";
import { DEFAULT_ASR_MODEL, isModelDownloaded } from "../asr/whisperModels";
import { transcribeOnDevice } from "../onDeviceAsr/onDeviceAsrClient";
import { runHeavy } from "../pipeline/jobQueue";
import { withTimeout } from "../../utils/withTimeout";
import { logger } from "../../utils/logger";

// Whisper's reading of the clips the live recognizer saved during a drill (plan
// 6.6): what the score reads, with each word's time. The live recognizer stays for
// on-screen feedback only. Null when the model isn't on the phone or Whisper
// didn't finish, and the caller scores a "Quick check" from the live words. Never
// throws. The clips are deleted either way: they are only needed for this.

export interface DrillTranscript {
  text: string;
  words: TimedWordInput[];
  durationMs: number;
}

// Gives up after this long (a take's own transcription may be using the model), and
// the drill is scored as a Quick check instead.
const MIN_WAIT_MS = 12_000;

export function discardClips(uris: string[]): void {
  for (const uri of uris) {
    try {
      new File(uri).delete();
    } catch {
      // A leftover clip in the cache is harmless.
    }
  }
}

export async function transcribeDrillClips(uris: string[], options: { clipSeconds?: number } = {}): Promise<DrillTranscript | null> {
  try {
    if (!uris.length || !isModelDownloaded(DEFAULT_ASR_MODEL)) return null;
    const waitMs = Math.max(MIN_WAIT_MS, (options.clipSeconds ?? 0) * 700);
    return await withTimeout(read(uris), waitMs, null);
  } catch (error) {
    logger.warn(`[drill] Whisper didn't finish, scoring a quick check — ${(error as Error).message}`);
    return null;
  } finally {
    discardClips(uris);
  }
}

async function read(uris: string[]): Promise<DrillTranscript | null> {
  {
    const parts: Float32Array[] = [];
    for (const uri of uris) {
      const decoded = await runHeavy(() => decodeVideoAudio(uri));
      if (decoded) parts.push(decoded.waveform);
    }
    if (!parts.length) return null;
    const waveform = concatWaveforms(parts);
    const result = await runHeavy(() => transcribeOnDevice(waveform));
    if (!result.text.trim() || !result.words.length) return null;
    return {
      text: result.text,
      words: result.words.map((w) => ({ text: w.text, startMs: Math.round(w.startSeconds * 1000), endMs: Math.round(w.endSeconds * 1000) })),
      durationMs: Math.round(result.durationSeconds * 1000),
    };
  }
}
