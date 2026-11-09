import { AudioManager, AudioRecorder } from "react-native-audio-api";
import { CONVERSATION_SESSION_IOS } from "./audioSession";
import { lowpass } from "../../domain/dsp/pitchTracker";
import { logger } from "../../utils/logger";

// Records a warm-up's sound straight into memory with react-native-audio-api's
// AudioRecorder (DECISIONS D20). A hiss, a hum or a siren has no words, so the
// speech recognizer would restart on it and leave gaps; this records the whole
// warm-up in one piece. Nothing is written to disk and nothing leaves the phone.
// Marks are taken in samples heard so far, so step windows line up with the audio.

const ANALYSIS_RATE = 16000;

export type CaptureStart = "ready" | "denied" | "failed";

export interface WarmUpCapture {
  start(): Promise<CaptureStart>;
  // Milliseconds of audio heard so far.
  elapsedMs(): number;
  stop(): Promise<{ waveform: Float32Array; sampleRate: number } | null>;
}

export function createWarmUpCapture(): WarmUpCapture {
  let recorder: AudioRecorder | null = null;
  const chunks: Float32Array[] = [];
  let rate = ANALYSIS_RATE;
  let frames = 0;

  return {
    async start() {
      try {
        const permission = await AudioManager.requestRecordingPermissions();
        if (permission !== "Granted") return "denied";
        // The recognizer's own session: the microphone, no voice processing, so
        // the levels are the real ones.
        AudioManager.setAudioSessionOptions({ ...CONVERSATION_SESSION_IOS, iosOptions: [...CONVERSATION_SESSION_IOS.iosOptions] });
        await AudioManager.setAudioSessionActivity(true);
        recorder = new AudioRecorder();
        const listening = recorder.onAudioReady({ sampleRate: ANALYSIS_RATE, bufferLength: 1600, channelCount: 1 }, (event) => {
          rate = event.buffer.sampleRate;
          chunks.push(new Float32Array(event.buffer.getChannelData(0).subarray(0, event.numFrames)));
          frames += event.numFrames;
        });
        if (listening.status === "error") throw new Error(listening.message);
        const started = await recorder.start();
        if (started.status === "error") throw new Error(started.message);
        return "ready";
      } catch (error) {
        logger.warn(`[warm-up] couldn't start recording — ${(error as Error).message}`);
        recorder = null;
        return "failed";
      }
    },
    elapsedMs() {
      return (frames / rate) * 1000;
    },
    async stop() {
      if (!recorder) return null;
      const r = recorder;
      recorder = null;
      try {
        await r.stop();
      } catch (error) {
        logger.warn(`[warm-up] stop failed — ${(error as Error).message}`);
      }
      r.clearOnAudioReady();
      if (!frames) return null;
      const waveform = new Float32Array(frames);
      let at = 0;
      for (const c of chunks) {
        waveform.set(c, at);
        at += c.length;
      }
      chunks.length = 0;
      return toAnalysisRate(waveform, rate);
    },
  };
}

// The phone may hand back 48 kHz even when asked for 16; the analysis runs at
// 16 kHz like a take's, so a whole multiple is filtered and thinned.
function toAnalysisRate(waveform: Float32Array, sampleRate: number): { waveform: Float32Array; sampleRate: number } {
  const factor = sampleRate / ANALYSIS_RATE;
  if (factor <= 1 || !Number.isInteger(factor)) return { waveform, sampleRate };
  const smooth = lowpass(waveform, sampleRate, ANALYSIS_RATE * 0.45);
  const out = new Float32Array(Math.floor(smooth.length / factor));
  for (let i = 0; i < out.length; i++) out[i] = smooth[i * factor];
  return { waveform: out, sampleRate: ANALYSIS_RATE };
}
