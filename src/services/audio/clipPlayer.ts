import { AudioContext, type AudioBufferSourceNode } from "react-native-audio-api";
import { logger } from "../../utils/logger";
import { withTimeout } from "../../utils/withTimeout";

// Plays back a short saved take (a WAV from the speech recognizer's
// persistAudio) — listen-back for Mark It Up reads and Move It takes. One
// clip at a time; starting another stops the last.

let context: AudioContext | null = null;
let current: AudioBufferSourceNode | null = null;

const DECODE_TIMEOUT_MS = 10_000;

export async function playClip(uri: string, onEnded?: () => void): Promise<boolean> {
  stopClip();
  try {
    context ??= new AudioContext();
    await context.resume();
    // Decode at the context's own rate. The takes are 16 kHz WAVs, and a
    // buffer source plays samples at the context's rate (48 kHz on iPhone)
    // without converting — decoded at the file's rate, a take played back
    // about three times too fast.
    const buffer = await withTimeout(context.decodeAudioData(uri), DECODE_TIMEOUT_MS, null);
    if (!buffer) {
      logger.error("[clipPlayer] decode timed out");
      return false;
    }
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

export function stopClip(): void {
  if (!current) return;
  try {
    current.stop();
  } catch {
    // already stopped
  }
  current = null;
}
