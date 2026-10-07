import { SpeechToTextModule, WHISPER_BASE_EN } from "react-native-executorch";
import { logger } from "../../utils/logger";
import { withTimeout } from "../../utils/withTimeout";

// react-native-executorch's speech-to-text module — chosen as the default,
// free, on-device transcription engine (see plan.md's Phase 2). Note: the
// plan originally targeted Moonshine as the default model, but the installed
// package (0.9.3, the current stable release) only exposes Whisper variants
// in its speech-to-text module — confirmed by reading the actual shipped
// type definitions, not assumed. WHISPER_BASE_EN (English-only, non-
// multilingual) is used over the smaller "tiny" variant for better accuracy
// while staying small, matching the plan's original size-tier reasoning.
//
// This uses the imperative SpeechToTextModule class, not the useSpeechToText
// hook — the hook only works inside a mounted React component, and this
// needs to run from sessionProcessor.ts's background pipeline, which isn't one.

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

let modulePromise: Promise<SpeechToTextModule> | null = null;

// Lazily created once per app session and reused across every transcription —
// loading involves downloading the model on first use (fromModelName handles
// its own disk caching internally, so subsequent loads are fast) and we don't
// want to repeat that per session. If loading ever fails, the cached promise
// is cleared so the next call gets a fresh attempt instead of repeating the
// same failure forever.
function getModule(onDownloadProgress?: (progress: number) => void): Promise<SpeechToTextModule> {
  if (!modulePromise) {
    modulePromise = SpeechToTextModule.fromModelName(WHISPER_BASE_EN, undefined, onDownloadProgress).catch(
      (error) => {
        modulePromise = null;
        throw error;
      },
    );
  }
  return modulePromise;
}

// Covers both model load (first-run download, ~100-200MB for WHISPER_BASE_EN
// over a slow connection) and the transcribe() call itself. Exists because
// the underlying native bridge has been observed to hang indefinitely
// (never resolving OR rejecting) rather than reject cleanly when the
// ResourceFetcher adapter is misconfigured — see withTimeout.ts and
// sessionProcessor.ts's resolveTranscriptAndAudio, which otherwise froze the
// whole session pipeline at "Save your recording" with no error shown and
// no way to recover short of force-quitting.
const TRANSCRIBE_TIMEOUT_MS = 90_000;

// Transcribes an already-decoded 16kHz mono waveform on-device. Free, no API
// key, no per-session cost — the default transcription source for every
// session (see sessionProcessor.ts). `verbose: true` is required to get
// word-level timestamps back (via segments[].words) — without it there's no
// WPM curve and no repeated-words detection, so this is not optional.
export async function transcribeOnDevice(
  waveform: Float32Array,
  onDownloadProgress?: (progress: number) => void,
): Promise<OnDeviceTranscriptResult> {
  const result = await withTimeout(
    (async () => {
      const model = await getModule(onDownloadProgress);
      return model.transcribe(waveform, { verbose: true });
    })(),
    TRANSCRIBE_TIMEOUT_MS,
    null,
  );
  if (!result) {
    throw new Error(`on-device ASR timed out after ${TRANSCRIBE_TIMEOUT_MS}ms`);
  }

  const words: OnDeviceTranscriptWord[] = (result.segments ?? [])
    .flatMap((segment) => segment.words ?? [])
    .map((word) => ({ text: word.word, startSeconds: word.start, endSeconds: word.end }));

  logger.info(
    `[onDeviceAsr] transcribed ${result.text.length} chars, ${words.length} words, duration=${result.duration}s`,
  );

  return { text: result.text, words, durationSeconds: result.duration };
}
