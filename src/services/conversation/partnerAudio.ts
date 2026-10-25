import { AudioContext, AudioManager, type AudioBufferQueueSourceNode } from "react-native-audio-api";
import { logger } from "../../utils/logger";
import { withTimeout } from "../../utils/withTimeout";
import { CONVERSATION_SESSION_IOS, PLAYBACK_SESSION_IOS } from "../audio/audioSession";

// Plays the conversation partner's voice as it streams in: 16-bit PCM chunks
// (24 kHz mono, about 0.2 s each, from ai-converse) decoded and queued on a
// buffer queue, at the chosen speed with the pitch kept.
//
// - It starts once a little is buffered (`prebufferMs`), so a slow chunk
//   doesn't leave a gap mid-word; a line shorter than that starts when it's
//   complete.
// - The engine is suspended between lines, so when the mic opens the
//   recognizer has the session to itself.
// - iPhone session: by default the recognizer's own (CONVERSATION_SESSION_IOS),
//   so the switch from listening to the partner and back changes nothing. The
//   Dev lab can pick plain playback to compare (test plan K).

export type PartnerSession = "conversation" | "playback";

export interface LineHandlers {
  // First sound out of the speaker.
  onStart?: () => void;
  // The last chunk has played (after finish()), or stop() was called.
  onEnd?: (how: "played" | "stopped") => void;
  // The audio engine did not do what it was asked (decode, start): said once,
  // just before onEnd("stopped"), so a line never waits forever in silence.
  onError?: (message: string) => void;
}

const SAMPLE_RATE = 24_000;
// The audio library's native calls have no timeout of their own and have been
// seen to never answer (utils/withTimeout.ts), so each is bounded.
const DECODE_TIMEOUT_MS = 5_000;
const ENGINE_TIMEOUT_MS = 5_000;
export const DEFAULT_PREBUFFER_MS = 400;

let context: AudioContext | null = null;
// A suspend in flight, so the next line waits for it before resuming.
let suspending: Promise<unknown> | null = null;
let session: PartnerSession = "conversation";

export function setPartnerSession(next: PartnerSession): void {
  session = next;
}

function applySession(): void {
  const options = session === "conversation" ? CONVERSATION_SESSION_IOS : PLAYBACK_SESSION_IOS;
  try {
    AudioManager.setAudioSessionOptions({ ...options, iosOptions: [...options.iosOptions] });
  } catch (error) {
    logger.warn(`[partner] couldn't set the audio session — ${(error as Error).message}`);
  }
}

function getContext(): AudioContext {
  if (!context) {
    applySession();
    // At the voice's own rate (24 kHz). A buffer plays its samples at the
    // context's rate without converting, so a 24 kHz voice on a 48 kHz context
    // came out twice as fast and an octave up: a chipmunk at 1x.
    context = new AudioContext({ sampleRate: SAMPLE_RATE });
    if (context.sampleRate !== SAMPLE_RATE) logger.warn(`[partner] the audio engine runs at ${context.sampleRate} Hz, not ${SAMPLE_RATE}; slowing the voice to match`);
  }
  return context;
}

// One partner line being played.
export class PartnerLinePlayer {
  private source: AudioBufferQueueSourceNode | null = null;
  private queuedMs = 0;
  private pending = 0;
  private started = false;
  private finished = false;
  private ended = false;
  private chain: Promise<void> = Promise.resolve();
  private readonly startedAt = Date.now();
  // Where it is, for the lab: "waiting", "decoding 3", "starting", "playing".
  stage = "waiting";
  chunksIn = 0;
  chunksDecoded = 0;

  constructor(
    private readonly rate: number,
    private readonly handlers: LineHandlers,
    private readonly prebufferMs = DEFAULT_PREBUFFER_MS,
  ) {}

  // Queues one chunk (base64 PCM). Chunks are decoded in order.
  push(pcmBase64: string): void {
    this.chunksIn += 1;
    this.chain = this.chain.then(() => this.enqueue(pcmBase64)).catch((error) => this.fail((error as Error).message));
  }

  // No more chunks for this line.
  finish(): void {
    this.chain = this.chain
      .then(async () => {
        this.finished = true;
        if (this.ended) return;
        if (!this.source && this.queuedMs === 0) return this.end("played");
        if (!this.started) await this.begin();
        if (this.pending === 0) this.end("played");
      })
      .catch((error) => this.fail((error as Error).message));
  }

  // Cut short (a tap, the conversation ending, an interruption).
  stop(): void {
    if (this.ended) return;
    try {
      this.source?.stop();
    } catch {
      // already stopped
    }
    this.end("stopped");
  }

  // Milliseconds from creating the player to the first sound, for the lab.
  firstSoundMs: number | null = null;

  private async enqueue(pcmBase64: string): Promise<void> {
    if (this.ended) return;
    const ctx = getContext();
    this.stage = `decoding ${this.chunksDecoded + 1}`;
    const buffer = await withTimeout(ctx.decodePCMInBase64(pcmBase64, SAMPLE_RATE, 1, true), DECODE_TIMEOUT_MS, null);
    if (!buffer) throw new Error(`the audio engine did not decode piece ${this.chunksDecoded + 1}`);
    this.chunksDecoded += 1;
    if (this.ended) return;
    if (!this.source) {
      // If the engine would not run at the voice's rate, play slower by the
      // difference (the pitch then moves with the speed setting; a fallback).
      const mismatch = ctx.sampleRate / SAMPLE_RATE;
      const source = ctx.createBufferQueueSource({ pitchCorrection: mismatch === 1 && this.rate !== 1 });
      source.playbackRate.value = this.rate / mismatch;
      source.connect(ctx.destination);
      source.onBufferEnded = (event) => {
        this.pending = Math.max(0, this.pending - 1);
        if (this.finished && (event.isLastBufferInQueue || this.pending === 0)) this.end("played");
      };
      this.source = source;
    }
    this.source.enqueueBuffer(buffer);
    this.pending += 1;
    this.queuedMs += buffer.duration * 1000;
    if (!this.started && this.queuedMs >= this.prebufferMs) await this.begin();
  }

  private async begin(): Promise<void> {
    if (this.started || this.ended || !this.source) return;
    this.started = true;
    this.stage = "starting";
    if (suspending) await withTimeout(suspending, ENGINE_TIMEOUT_MS, undefined);
    applySession();
    const resumed = await withTimeout(getContext().resume().then(() => true), ENGINE_TIMEOUT_MS, false);
    if (!resumed) throw new Error("the audio engine did not start");
    this.stage = "playing";
    // Not start(): react-native-audio-api 0.13's queue source defaults its offset
    // to -1 and then refuses it ("offset must be a finite non-negative number:
    // -1"), so a bare start() always throws. An explicit 0 starts at the front.
    this.source.start(0, 0);
    this.firstSoundMs = Date.now() - this.startedAt;
    this.handlers.onStart?.();
  }

  // Something below did not answer: say so once and end the line.
  private fail(message: string): void {
    if (this.ended) return;
    logger.warn(`[partner] ${message} (at ${this.stage}; ${this.chunksDecoded} of ${this.chunksIn} pieces decoded)`);
    this.handlers.onError?.(`${message} (at ${this.stage})`);
    this.stop();
  }

  private end(how: "played" | "stopped"): void {
    if (this.ended) return;
    this.ended = true;
    this.source = null;
    // Let the engine stop, so the recognizer gets the session cleanly.
    if (context) {
      suspending = context
        .suspend()
        .catch(() => undefined)
        .finally(() => {
          suspending = null;
        });
    }
    this.handlers.onEnd?.(how);
  }
}
