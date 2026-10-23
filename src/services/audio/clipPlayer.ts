import { AudioContext, AudioManager, type AudioBufferSourceNode } from "react-native-audio-api";
import { logger } from "../../utils/logger";
import { withTimeout } from "../../utils/withTimeout";
import { PLAYBACK_SESSION_IOS } from "./audioSession";

// Plays back a short saved take (a WAV from the speech recognizer's
// persistAudio) — listen-back for Line of the Day and Mark It Up reads, Move
// It takes and Rewind. One clip at a time; starting another stops the last.
//
// The audio context is suspended whenever nothing is playing. That matters
// on iPhone, where the session is shared (audioSession.ts):
// - react-native-audio-api sets its playback session only when its engine
//   starts. A context left running from the last clip never starts again, so
//   the next clip played in whatever session the recorder had just set (a
//   recording session, not playback): sometimes the speaker, sometimes not.
//   Resuming a suspended context restarts the engine, which sets playback
//   every time.
// - A running engine also reacts when a recorder changes the session (the
//   speech recognizer, the camera) by restarting itself and setting playback
//   again, in the middle of the recording. Suspended, it doesn't.

let context: AudioContext | null = null;
let current: AudioBufferSourceNode | null = null;
// The suspend in flight, so a clip started right after waits for it.
let suspending: Promise<unknown> | null = null;

const DECODE_TIMEOUT_MS = 10_000;

function getContext(): AudioContext {
  if (!context) {
    try {
      AudioManager.setAudioSessionOptions({ ...PLAYBACK_SESSION_IOS, iosOptions: [...PLAYBACK_SESSION_IOS.iosOptions] });
    } catch (error) {
      logger.warn(`[clipPlayer] couldn't set the playback session — ${(error as Error).message}`);
    }
    context = new AudioContext();
  }
  return context;
}

// Nothing is playing: let the engine stop.
function idle(): void {
  if (!context || current) return;
  const ctx = context;
  suspending = ctx
    .suspend()
    .catch(() => undefined)
    .finally(() => {
      suspending = null;
    });
}

export async function playClip(uri: string, onEnded?: () => void): Promise<boolean> {
  stopSource();
  try {
    if (suspending) await suspending;
    const ctx = getContext();
    // Restarts the engine, which sets the playback session first.
    await ctx.resume();
    // Decode at the context's own rate. Takes are 48 kHz WAVs on iPhone (16
    // kHz on Android, and in Rewind's kept audio), and a buffer source plays
    // samples at the context's rate without converting — decoded at a 16 kHz
    // file's rate, a take played back about three times too fast.
    const buffer = await withTimeout(ctx.decodeAudioData(uri), DECODE_TIMEOUT_MS, null);
    if (!buffer) {
      logger.error("[clipPlayer] decode timed out");
      idle();
      return false;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onEnded = () => {
      if (current !== source) return;
      current = null;
      idle();
      onEnded?.();
    };
    source.start();
    current = source;
    return true;
  } catch (error) {
    logger.error(`[clipPlayer] couldn't play ${uri} — ${(error as Error).message}`);
    idle();
    return false;
  }
}

function stopSource(): void {
  if (!current) return;
  const source = current;
  current = null;
  try {
    source.stop();
  } catch {
    // already stopped
  }
}

export function stopClip(): void {
  stopSource();
  idle();
}
