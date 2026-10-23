import { initWhisper, type WhisperContext } from "whisper.rn";
import { wordsFromSegments, type TimedWord } from "../../domain/asr/verbatim";
import { pcm16FromFloat32 } from "../../domain/asr/pcm";
import { logger } from "../../utils/logger";
import { ensureModel, type WhisperModelId } from "./whisperModels";

// whisper.rn (whisper.cpp) behind one small function. Only one model is kept
// in memory: the large ones are big, so loading another releases the last.

// Written like the speech we want back, fillers included: whisper models
// continue in the style of the text they are primed with.
export const FILLER_PROMPT = "Um, so, uh, I was, like, you know, thinking that, um, we could, uh, try it. Hmm, I mean, yeah.";

let cached: { id: WhisperModelId; context: WhisperContext } | null = null;
let loading: Promise<WhisperContext> | null = null;

export async function releaseWhisperContext(): Promise<void> {
  const current = cached;
  cached = null;
  if (current) await current.context.release().catch(() => undefined);
}

async function contextFor(id: WhisperModelId): Promise<WhisperContext> {
  if (cached?.id === id) return cached.context;
  if (loading) await loading.catch(() => undefined);
  if (cached?.id === id) return cached.context;
  await releaseWhisperContext();
  loading = (async () => {
    const uri = await ensureModel(id);
    const started = Date.now();
    const context = await initWhisper({ filePath: uri });
    logger.info("[whisper.rn] loaded " + id + " in " + (Date.now() - started) + " ms, gpu=" + context.gpu + (context.gpu ? "" : " (" + context.reasonNoGPU + ")"));
    cached = { id, context };
    return context;
  })();
  try {
    return await loading;
  } finally {
    loading = null;
  }
}

export interface WhisperRnResult {
  text: string;
  words: TimedWord[];
}

export interface WhisperRnOptions {
  // Text the decoder is primed with. Written like the speech you want back
  // (fillers included), it nudges the model to keep them.
  prompt?: string;
  language?: string;
}

// Transcribes a 16 kHz mono waveform. transcribeData reads raw signed 16-bit
// PCM, so the floats are converted first. Word timings come from token-level
// segments (maxLen 1 with token timestamps).
export async function transcribeWithWhisperRn(id: WhisperModelId, waveform: Float32Array, options: WhisperRnOptions = {}): Promise<WhisperRnResult> {
  const context = await contextFor(id);
  const { promise } = context.transcribeData(pcm16FromFloat32(waveform), {
    language: options.language ?? "en",
    prompt: options.prompt,
    tokenTimestamps: true,
    maxLen: 1,
  });
  const result = await promise;
  return { text: result.result.trim(), words: wordsFromSegments(result.segments) };
}
