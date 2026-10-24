import { decodeAudioData } from "react-native-audio-api";
import { logger } from "../utils/logger";
import { withTimeout } from "../utils/withTimeout";

// 16kHz matches what Whisper expects too — decoding once at this rate lets the same waveform feed both the
// on-device ASR call and the voice analysis (domain/dsp/audioFeatures.ts), instead of decoding the video twice.
export const ASR_SAMPLE_RATE = 16000;

export interface DecodedAudio {
  waveform: Float32Array;
  sampleRate: number;
}

// Generous but bounded — decoding a 1-5 min recording should take a few
// seconds at most. This exists specifically because the underlying native
// bridge call has been observed to hang indefinitely (never resolving OR
// rejecting) rather than fail cleanly when a related native module is in a
// bad state, which silently froze the whole session pipeline at "Save your
// recording" with no error and no way to recover short of force-quitting.
// See withTimeout.ts.
const DECODE_TIMEOUT_MS = 30_000;

// Single shared decode step for a recorded session's video file. Never
// throws — callers get `null` on failure (or timeout) and degrade
// accordingly (ASR falls back to the deep review's transcription, DSP marks
// dsp_status='failed').
export async function decodeVideoAudio(videoUri: string): Promise<DecodedAudio | null> {
  try {
    const audioBuffer = await withTimeout(decodeAudioData(videoUri, ASR_SAMPLE_RATE), DECODE_TIMEOUT_MS, null);
    if (!audioBuffer) {
      logger.error(`[audioAnalysis] decodeVideoAudio timed out after ${DECODE_TIMEOUT_MS}ms`);
      return null;
    }
    return { waveform: audioBuffer.getChannelData(0), sampleRate: audioBuffer.sampleRate };
  } catch (error) {
    logger.error(`[audioAnalysis] decodeVideoAudio failed — ${(error as Error).message}`);
    return null;
  }
}

export type DspStatus = "complete" | "failed";
