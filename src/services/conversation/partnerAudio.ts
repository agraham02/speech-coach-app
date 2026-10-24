import { AudioContext, AudioManager, type AudioBufferQueueSourceNode } from "react-native-audio-api";
import { logger } from "../../utils/logger";
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
}

const SAMPLE_RATE = 24_000;
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
    context = new AudioContext();
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

  constructor(
    private readonly rate: number,
    private readonly handlers: LineHandlers,
    private readonly prebufferMs = DEFAULT_PREBUFFER_MS,
  ) {}

  // Queues one chunk (base64 PCM). Chunks are decoded in order.
  push(pcmBase64: string): void {
    this.chain = this.chain.then(() => this.enqueue(pcmBase64)).catch((error) => logger.warn(`[partner] chunk failed — ${(error as Error).message}`));
  }

  // No more chunks for this line.
  finish(): void {
    this.chain = this.chain.then(async () => {
      this.finished = true;
      if (!this.source && this.queuedMs === 0) return this.end("played");
      if (!this.started) await this.begin();
      if (this.pending === 0) this.end("played");
    });
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
    const buffer = await ctx.decodePCMInBase64(pcmBase64, SAMPLE_RATE, 1, true);
    if (this.ended) return;
    if (!this.source) {
      const source = ctx.createBufferQueueSource({ pitchCorrection: this.rate !== 1 });
      source.playbackRate.value = this.rate;
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
    if (suspending) await suspending;
    applySession();
    await getContext().resume();
    this.source.start();
    this.firstSoundMs = Date.now() - this.startedAt;
    this.handlers.onStart?.();
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
