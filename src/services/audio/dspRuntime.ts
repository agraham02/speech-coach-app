import { extractAudioFeatures, type AudioFeatures } from "../../domain/dsp/audioFeatures";
import { logger } from "../../utils/logger";

// Runs the audio feature extraction (pitch, loudness, voice activity) on a
// background JS runtime from react-native-worklets, so the 2 to 5 seconds of
// DSP a minute-long take needs never block the JS thread (taps, scrolling,
// the waiting screen's animations). react-native-worklets is already in the
// app for Reanimated, so this needs no new native code.
//
// If the runtime can't be created or the call fails (a worklet that didn't
// get transformed, an older build), the same pure function runs on the JS
// thread instead: there is always a working path. Which one ran, and how long
// it took, is recorded in the feature track and the log.

type WorkletsApi = {
  createWorkletRuntime: (config: { name: string }) => unknown;
  runOnRuntimeAsync: <A extends unknown[], R>(runtime: unknown, fn: (...args: A) => R, ...args: A) => Promise<R>;
};

let runtime: unknown = null;
let unavailable = false;

function worklets(): WorkletsApi | null {
  if (unavailable) return null;
  try {
    // Required lazily: tests and the offline scripts never load it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-worklets") as WorkletsApi;
  } catch {
    unavailable = true;
    return null;
  }
}

export interface ExtractionRun {
  features: AudioFeatures;
  thread: "worklet" | "js";
  elapsedMs: number;
}

export async function extractOffThread(waveform: Float32Array, sampleRate: number): Promise<ExtractionRun> {
  const started = Date.now();
  const api = worklets();
  if (api) {
    try {
      runtime ??= api.createWorkletRuntime({ name: "tono-dsp" });
      const features = await api.runOnRuntimeAsync(runtime, extractAudioFeatures, waveform, sampleRate);
      const elapsedMs = Date.now() - started;
      logger.info(`[dsp] features on the worklet runtime in ${elapsedMs} ms (${(waveform.length / sampleRate).toFixed(1)} s of audio)`);
      return { features, thread: "worklet", elapsedMs };
    } catch (error) {
      unavailable = true;
      logger.warn(`[dsp] worklet runtime failed, running on the JS thread: ${(error as Error).message}`);
    }
  }
  const jsStarted = Date.now();
  // Let the UI paint before the long synchronous call.
  await new Promise((resolve) => setTimeout(resolve, 0));
  const features = extractAudioFeatures(waveform, sampleRate);
  const elapsedMs = Date.now() - jsStarted;
  logger.info(`[dsp] features on the JS thread in ${elapsedMs} ms (${(waveform.length / sampleRate).toFixed(1)} s of audio)`);
  return { features, thread: "js", elapsedMs };
}
