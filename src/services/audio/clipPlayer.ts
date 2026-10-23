import { AudioContext, AudioManager, type AudioBuffer, type AudioBufferSourceNode } from "react-native-audio-api";
import { logger } from "../../utils/logger";
import { withTimeout } from "../../utils/withTimeout";
import { PLAYBACK_SESSION_IOS } from "./audioSession";

// Plays back a saved take (a WAV from the speech recognizer's persistAudio,
// or a Rewind) — listen-back for Line of the Day and Mark It Up reads, Move
// It takes and Rewinds. One clip at a time; starting another stops the last.
//
// Two ways in: playClip plays a file through once (the short takes), and
// loadClip + startClip give the Rewind player seeking, speed and position.
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
// How often a playing clip reports where it is.
const POSITION_INTERVAL_MS = 100;

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

// Restarts the engine, which sets the playback session first.
async function readyContext(): Promise<AudioContext> {
  if (suspending) await suspending;
  const ctx = getContext();
  await ctx.resume();
  return ctx;
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

// Decodes at the context's own rate. Takes are 48 kHz WAVs on iPhone (16 kHz
// on Android, and in Rewind's kept audio), and a buffer source plays samples
// at the context's rate without converting — decoded at a 16 kHz file's
// rate, a take played back about three times too fast.
async function decode(ctx: AudioContext, uri: string): Promise<AudioBuffer | null> {
  const buffer = await withTimeout(ctx.decodeAudioData(uri), DECODE_TIMEOUT_MS, null);
  if (!buffer) logger.error("[clipPlayer] decode timed out");
  return buffer;
}

// Decodes a file for startClip. Leaves the engine suspended unless a clip is
// playing, so loading a Rewind doesn't hold the session.
export async function loadClip(uri: string): Promise<AudioBuffer | null> {
  try {
    return await decode(await readyContext(), uri);
  } catch (error) {
    logger.error(`[clipPlayer] couldn't load ${uri} — ${(error as Error).message}`);
    return null;
  } finally {
    idle();
  }
}

export async function playClip(uri: string, onEnded?: () => void): Promise<boolean> {
  stopSource();
  try {
    const ctx = await readyContext();
    const buffer = await decode(ctx, uri);
    if (!buffer) {
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
  stopSource();
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
      idle();
      options.onFinished();
    };
    source.start(0, Math.max(0, options.offsetMs / 1000));
    current = source;
    return true;
  } catch (error) {
    logger.error(`[clipPlayer] couldn't start clip — ${(error as Error).message}`);
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
