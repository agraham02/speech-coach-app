import { decodeVideoAudio } from "../../../domain/audioAnalysis";
import { summarizeFeatures } from "../../../domain/dev/voiceLab";
import type { StepMeasure } from "../../../domain/signalLab/types";
import { encodeWavPcm16 } from "../../../domain/eval/wer";
import { ASR_ENGINES } from "../../asr/asrEngines";
import { isModelDownloaded } from "../../asr/whisperModels";
import { extractOffThread } from "../../audio/dspRuntime";

// Turns a recorded clip into the numbers a Signal Lab test reads, through the
// same functions a real take uses: the audio decode, the off-thread feature
// extractor (pitch, level, speech and pause frames), and Whisper with the
// app's own filler prompt for word times. Nothing here decides pass or fail.

export interface ClipAnalysis {
  audio?: StepMeasure["audio"];
  words?: StepMeasure["words"];
  engines?: StepMeasure["engines"];
  // The clip's audio as a WAV, for the raw data export.
  wav?: Uint8Array;
  // What went wrong or was skipped, in plain words, for the result screen.
  problems: string[];
  timings: { decodeMs: number; dspMs: number };
}

// The engine real takes use for word times.
const APP_ENGINE_ID = "turbo-prompted";

export async function analyzeLabClip(uri: string, options: { words?: boolean; engines?: boolean }): Promise<ClipAnalysis> {
  const problems: string[] = [];
  const started = Date.now();
  const decoded = await decodeVideoAudio(uri);
  const decodeMs = Date.now() - started;
  if (!decoded) {
    return { problems: ["The recording's audio couldn't be read."], timings: { decodeMs, dspMs: 0 } };
  }
  const run = await extractOffThread(decoded.waveform, decoded.sampleRate);
  const result: ClipAnalysis = {
    audio: { features: run.features, summary: summarizeFeatures(run.features) },
    wav: encodeWavPcm16(decoded.waveform, decoded.sampleRate),
    problems,
    timings: { decodeMs, dspMs: run.elapsedMs },
  };

  if (options.engines) {
    const engines: NonNullable<StepMeasure["engines"]> = {};
    for (const engine of ASR_ENGINES) {
      if (!engine.isAvailable() || (engine.model && !isModelDownloaded(engine.model))) {
        problems.push(`${engine.label} isn't available on this phone, so it was skipped.`);
        continue;
      }
      const t0 = Date.now();
      try {
        const out = await engine.transcribe(decoded);
        engines[engine.id] = { text: out.text, words: out.words ?? null, ms: Date.now() - t0 };
      } catch (error) {
        problems.push(`${engine.label} failed: ${(error as Error).message}`);
      }
    }
    result.engines = engines;
    const app = engines[APP_ENGINE_ID];
    if (app?.words) result.words = app.words;
  } else if (options.words) {
    const engine = ASR_ENGINES.find((e) => e.id === APP_ENGINE_ID);
    if (!engine || (engine.model && !isModelDownloaded(engine.model))) {
      problems.push("The transcription model isn't downloaded, so this step has no word times.");
    } else {
      try {
        const out = await engine.transcribe(decoded);
        if (out.words) result.words = out.words;
        else problems.push("The transcriber gave no word times.");
      } catch (error) {
        problems.push(`Transcription failed: ${(error as Error).message}`);
      }
    }
  }
  return result;
}
