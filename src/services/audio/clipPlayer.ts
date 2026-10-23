import { AudioContext, type AudioBuffer, type AudioBufferSourceNode } from "react-native-audio-api";
import { logger } from "../../utils/logger";
import { withTimeout } from "../../utils/withTimeout";

// Plays back a saved take (a WAV from the speech recognizer's persistAudio,
// or a Rewind) — listen-back for Mark It Up reads, Move It takes and Rewinds.
// One clip at a time; starting another stops the last.
//
// Two ways in: playClip plays a file through once (the short takes), and
// loadClip + startClip give the Rewind player seeking, speed and position.

let context: AudioContext | null = null;
let current: AudioBufferSourceNode | null = null;

const DECODE_TIMEOUT_MS = 10_000;
// How often a playing clip reports where it is.
const POSITION_INTERVAL_MS = 100;

async function readyContext(): Promise<AudioContext> {
  context ??= new AudioContext();
  await context.resume();
  return context;
}

// Decodes a file at the context's own rate. The takes are 16 kHz WAVs, and a
// buffer source plays samples at the context's rate (48 kHz on iPhone)
// without converting — decoded at the file's rate, a take played back about
// three times too fast.
export async function loadClip(uri: string): Promise<AudioBuffer | null> {
  try {
    const ctx = await readyContext();
    const buffer = await withTimeout(ctx.decodeAudioData(uri), DECODE_TIMEOUT_MS, null);
    if (!buffer) logger.error("[clipPlayer] decode timed out");
    return buffer;
  } catch (error) {
    logger.error(`[clipPlayer] couldn't load ${uri} — ${(error as Error).message}`);
    return null;
  }
}

export async function playClip(uri: string, onEnded?: () => void): Promise<boolean> {
  stopClip();
  const buffer = await loadClip(uri);
  if (!buffer || !context) return false;
  try {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.onEnded = () => {
      if (current === source) current = null;
      onEnded?.();
    };
    source.start();
    current = source;
    return true;
  } catch (error) {
    logger.error(`[clipPlayer] couldn't play ${uri} — ${(error as Error).message}`);
    return false;
  }
}

export interface StartClipOptions {
  offsetMs: number;
  rate: number;
  // Where in the clip playback is, about ten times a second.
  onPosition: (ms: number) => void;
  // Played to the end (not stopped, and not replaced by another clip).
  onFinished: () => void;
}

// Starts a decoded clip from `offsetMs` at `rate`. A buffer source can only
// be started once, so a seek or a speed change stops this one and starts a
// fresh one from the new place. Pitch is kept when the speed isn't 1×.
export async function startClip(buffer: AudioBuffer, options: StartClipOptions): Promise<boolean> {
  stopClip();
  try {
    const ctx = await readyContext();
    const source = ctx.createBufferSource({ pitchCorrection: options.rate !== 1 });
    source.buffer = buffer;
    source.playbackRate.value = options.rate;
    source.connect(ctx.destination);
    source.onPositionChangedInterval = POSITION_INTERVAL_MS;
    source.onPositionChanged = (event) => {
      if (current === source) options.onPosition(event.value * 1000);
    };
    source.onEnded = () => {
      if (current !== source) return; // stopped or replaced
      current = null;
      options.onFinished();
    };
    source.start(0, Math.max(0, options.offsetMs / 1000));
    current = source;
    return true;
  } catch (error) {
    logger.error(`[clipPlayer] couldn't start clip — ${(error as Error).message}`);
    return false;
  }
}

export function stopClip(): void {
  if (!current) return;
  const source = current;
  current = null;
  try {
    source.stop();
  } catch {
    // already stopped
  }
}
