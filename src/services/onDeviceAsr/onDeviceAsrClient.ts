import { logger } from "../../utils/logger";
import { withTimeout } from "../../utils/withTimeout";
import { DEFAULT_ASR_MODEL, isModelDownloaded } from "../asr/whisperModels";
import { skipModelDownloadActive } from "../dev/skipModel";

// The app's speech-to-text: Whisper large-v3-turbo through whisper.rn
// (whisper.cpp), primed with a filler-heavy prompt. In the ASR Lab it kept
// 10 of 10 ums and uhs with 0.8% word errors and real word timings. The model
// is a download (onboarding, or Settings, Coaching & AI), so until it is on
// the phone there is nothing to transcribe with.

export interface OnDeviceTranscriptWord {
  text: string;
  startSeconds: number;
  endSeconds: number;
}

export interface OnDeviceTranscriptResult {
  text: string;
  words: OnDeviceTranscriptWord[];
  durationSeconds: number;
}

// The transcription model has not been downloaded yet.
export class TranscriptionModelMissingError extends Error {
  constructor() {
    // Dev builds with the model download skipped say so, instead of sending a
    // tester to a download they chose to skip.
    super(
      skipModelDownloadActive()
        ? "Dev: the transcription model download is skipped, so this take can't be turned into text. Turn it off in Dev, App tools, State presets, or download the model in Settings, Coaching & AI."
        : "The transcription model isn't on this phone yet. Download it in Settings, Coaching & AI, then retry.",
    );
    this.name = "TranscriptionModelMissingError";
  }
}

const ASR_SAMPLE_RATE = 16000;

// Transcribes an already-decoded 16 kHz mono waveform on the phone. Free, no
// API key, no per-session cost.
export async function transcribeOnDevice(waveform: Float32Array): Promise<OnDeviceTranscriptResult> {
  if (!isModelDownloaded(DEFAULT_ASR_MODEL)) throw new TranscriptionModelMissingError();
  // Lazy: whisper.rn's native module loads only when a take needs it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { transcribeWithWhisperRn, releaseWhisperContext, FILLER_PROMPT } = require("../asr/whisperRn") as typeof import("../asr/whisperRn");
  const seconds = waveform.length / ASR_SAMPLE_RATE;
  // About 0.3x real time on an iPhone 15 Pro; this allows 3x plus the load.
  // Without a limit a stuck native call would freeze the whole pipeline.
  const budgetMs = 60_000 + seconds * 1000;
  try {
    const started = Date.now();
    const result = await withTimeout(transcribeWithWhisperRn(DEFAULT_ASR_MODEL, waveform, { prompt: FILLER_PROMPT }), budgetMs, null);
    if (!result) throw new Error(`on-device ASR timed out after ${Math.round(budgetMs / 1000)}s`);
    if (!result.text.trim()) throw new Error("on-device ASR returned no text");
    logger.info(`[onDeviceAsr] transcribed ${result.words.length} words in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return {
      text: result.text,
      words: result.words.map((w) => ({ text: w.text, startSeconds: w.startMs / 1000, endSeconds: w.endMs / 1000 })),
      durationSeconds: seconds,
    };
  } finally {
    // The model is over half a gigabyte in memory: free it between takes.
    await releaseWhisperContext().catch(() => undefined);
  }
}
