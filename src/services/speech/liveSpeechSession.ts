import {
  beginTask,
  EMPTY_TRANSCRIPT,
  finalizePartial,
  fullText,
  reduceResult,
  type LiveTranscript,
} from "../../domain/speech/liveTranscript";

// A reusable live speech-recognition engine for every drill that listens
// (tongue twisters now; pace, fluency and filler drills later). It replaces
// the old thin hook, whose session ended at the first breath — and whose
// `end` event then auto-finished the attempt.
//
// Rules:
// - Only the caller ends an attempt. Silence never does: while an attempt is
//   active, an unexpected `end` (or a benign error such as no-speech)
//   restarts recognition and keeps everything heard so far.
// - stop() waits briefly for the trailing final so the last word counts.
// - The native module is injected, so tests can drive it with a fake.

export type LiveSpeechStatus =
  | "idle"
  | "preparing"
  | "listening"
  | "restarting"
  | "stopping"
  | "stopped"
  | "paused"
  | "error"
  | "unavailable"
  | "permission-denied";

export interface LiveSpeechSnapshot {
  status: LiveSpeechStatus;
  transcript: LiveTranscript;
  text: string;
  error: string | null;
  onDevice: boolean;
  // -2..10 from the native meter; <= 0 is inaudible.
  volume: number;
  // Epoch ms when the microphone actually started for this attempt.
  audioStartedAtMs: number | null;
  restarts: number;
}

interface Subscription {
  remove(): void;
}

// The subset of ExpoSpeechRecognitionModule this engine needs.
export interface SpeechNative {
  start(options: Record<string, unknown>): void;
  stop(): void;
  abort(): void;
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  isRecognitionAvailable(): boolean;
  supportsOnDeviceRecognition(): boolean;
  // Android 13+ and iOS: can save the recognized audio to a WAV file.
  supportsRecording?(): boolean;
  addListener(eventName: string, listener: (event: any) => void): Subscription;
}

export interface LiveSpeechStartOptions {
  lang?: string;
  // Words to bias recognition toward. Pass only rare/unusual words — biasing
  // common words would hide genuine mispronunciations.
  contextualStrings?: string[];
  preferOnDevice?: boolean;
  keepAlive?: boolean;
  maxRestarts?: number;
  volumeMeter?: boolean;
  // Milliseconds between volume readings when volumeMeter is on.
  volumeIntervalMs?: number;
  // Save what was heard to WAV files (one per recognition task) — for
  // listen-back and pitch analysis. Ignored where unsupported.
  persistAudio?: boolean;
  // Ask the recognizer for full stops and commas, so a summary can be counted
  // in sentences. iOS only; on Android it needs on-device recognition. Off
  // elsewhere: every other drill reads unpunctuated text.
  punctuation?: boolean;
}

export interface VolumeSample {
  tMs: number; // since the attempt started
  value: number; // -2..10, <= 0 is silence
}

export interface LiveSpeechClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const defaultClock: LiveSpeechClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const BENIGN_ERRORS = new Set(["no-speech", "speech-timeout", "busy", "client", "nomatch", "network", "unknown"]);
const DEFAULT_MAX_RESTARTS = 25;
const STOP_GRACE_MS = 1200;
// A recognition task shorter than this counts as a fast failure for backoff.
const FAST_FAIL_MS = 1500;

export class LiveSpeechSession {
  private snapshot: LiveSpeechSnapshot;
  private listeners = new Set<() => void>();
  // Volume readings, for a live waveform: delivered straight to the caller,
  // never through the snapshot, so ten or twenty a second don't re-render a
  // screen.
  private volumeListeners = new Set<(value: number) => void>();
  private subscriptions: Subscription[] = [];
  private options: Required<LiveSpeechStartOptions> | null = null;
  private active = false;
  private stopRequested = false;
  private endWaiters: (() => void)[] = [];
  private stopPromise: Promise<LiveTranscript> | null = null;
  private restartTimer: unknown = null;
  private taskStartedAt = 0;
  private fastFails = 0;
  // Volume history for pause/projection drills. Kept outside the snapshot
  // so 10 readings a second don't re-render the screen.
  private volumeSamples: VolumeSample[] = [];
  private attemptStartedAt = 0;
  // WAV files saved during this attempt (persistAudio), oldest first.
  private recordings: string[] = [];

  constructor(
    private readonly native: SpeechNative | null,
    private readonly clock: LiveSpeechClock = defaultClock,
  ) {
    this.snapshot = {
      status: native && safeAvailable(native) ? "idle" : "unavailable",
      transcript: EMPTY_TRANSCRIPT,
      text: "",
      error: null,
      onDevice: false,
      volume: -2,
      audioStartedAtMs: null,
      restarts: 0,
    };
  }

  // --- external store plumbing (useSyncExternalStore) ---------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): LiveSpeechSnapshot => this.snapshot;

  // Calls `fn` with each volume reading (-2..10) while listening. Returns the
  // way to stop.
  onVolume(fn: (value: number) => void): () => void {
    this.volumeListeners.add(fn);
    return () => this.volumeListeners.delete(fn);
  }

  private update(patch: Partial<LiveSpeechSnapshot>) {
    const next = { ...this.snapshot, ...patch };
    if (patch.transcript) next.text = fullText(patch.transcript);
    this.snapshot = next;
    this.listeners.forEach((l) => l());
  }

  getVolumeSamples(): VolumeSample[] {
    return this.volumeSamples;
  }

  getRecordings(): string[] {
    return this.recordings;
  }

  canPersistAudio(): boolean {
    try {
      return !!this.native?.supportsRecording?.();
    } catch {
      return false;
    }
  }

  // --- lifecycle -----------------------------------------------------------

  async prepare(): Promise<"ready" | "denied" | "unavailable"> {
    if (!this.native || this.snapshot.status === "unavailable") return "unavailable";
    try {
      const permission = await this.native.requestPermissionsAsync();
      if (!permission.granted) {
        this.update({ status: "permission-denied" });
        return "denied";
      }
      return "ready";
    } catch (error) {
      this.update({ status: "error", error: (error as Error).message });
      return "unavailable";
    }
  }

  start(options: LiveSpeechStartOptions = {}): void {
    if (!this.native) return;
    this.attachListeners();
    const onDevice = (options.preferOnDevice ?? true) && safeSupportsOnDevice(this.native);
    this.options = {
      lang: options.lang ?? "en-US",
      contextualStrings: (options.contextualStrings ?? []).slice(0, 100),
      preferOnDevice: onDevice,
      keepAlive: options.keepAlive ?? true,
      maxRestarts: options.maxRestarts ?? DEFAULT_MAX_RESTARTS,
      volumeMeter: options.volumeMeter ?? false,
      volumeIntervalMs: options.volumeIntervalMs ?? 200,
      persistAudio: (options.persistAudio ?? false) && this.canPersistAudio(),
      punctuation: options.punctuation ?? false,
    };
    this.volumeSamples = [];
    this.recordings = [];
    this.attemptStartedAt = this.clock.now();
    this.active = true;
    this.stopRequested = false;
    this.stopPromise = null;
    this.fastFails = 0;
    this.update({
      status: "preparing",
      transcript: EMPTY_TRANSCRIPT,
      error: null,
      onDevice,
      audioStartedAtMs: null,
      restarts: 0,
      volume: -2,
    });
    this.startNative();
  }

  // Ends the attempt: waits up to `graceMs` for the trailing final result,
  // then promotes any leftover partial so the last words still count.
  // Calling it twice returns the same promise.
  stop(graceMs = STOP_GRACE_MS): Promise<LiveTranscript> {
    if (this.stopPromise) return this.stopPromise;
    this.stopPromise = this.doStop(graceMs);
    return this.stopPromise;
  }

  private async doStop(graceMs: number): Promise<LiveTranscript> {
    this.clearRestartTimer();
    const wasRunning = this.active || this.snapshot.status === "restarting";
    this.active = false;
    this.stopRequested = true;
    if (wasRunning && this.native) {
      this.update({ status: "stopping" });
      const ended = new Promise<void>((resolve) => this.endWaiters.push(resolve));
      try {
        this.native.stop();
      } catch {
        // Already stopped natively — the grace timeout below still resolves.
      }
      await Promise.race([ended, new Promise<void>((resolve) => this.clock.setTimeout(resolve, graceMs))]);
      if (this.endWaiters.length) {
        this.endWaiters = [];
        try {
          this.native.abort();
        } catch {
          // ignore
        }
      }
    }
    const transcript = finalizePartial(this.snapshot.transcript, this.clock.now());
    const terminal = this.snapshot.status;
    const keepStatus = terminal === "permission-denied" || terminal === "unavailable" || terminal === "error";
    this.update({ transcript, status: keepStatus ? terminal : "stopped" });
    return transcript;
  }

  // Resumes after an interruption (phone call, Siri) without losing text.
  resume(): void {
    if (!this.native || !this.options || this.snapshot.status !== "paused") return;
    this.active = true;
    this.stopRequested = false;
    this.stopPromise = null;
    this.update({ status: "restarting", transcript: beginTask(this.snapshot.transcript, this.clock.now()) });
    this.startNative();
  }

  abort(): void {
    this.clearRestartTimer();
    this.active = false;
    this.stopRequested = true;
    try {
      this.native?.abort();
    } catch {
      // ignore
    }
  }

  dispose(): void {
    this.abort();
    this.subscriptions.forEach((s) => s.remove());
    this.subscriptions = [];
    this.listeners.clear();
  }

  // --- native plumbing -----------------------------------------------------

  private startNative() {
    if (!this.native || !this.options) return;
    this.taskStartedAt = this.clock.now();
    try {
      this.native.start({
        lang: this.options.lang,
        interimResults: true,
        continuous: true,
        maxAlternatives: 3,
        addsPunctuation: this.options.punctuation,
        requiresOnDeviceRecognition: this.options.preferOnDevice,
        contextualStrings: this.options.contextualStrings,
        ...(this.options.volumeMeter
          ? { volumeChangeEventOptions: { enabled: true, intervalMillis: this.options.volumeIntervalMs } }
          : {}),
        // 16 kHz int16 on both platforms — what the pitch analysis decodes at.
        ...(this.options.persistAudio
          ? { recordingOptions: { persist: true, outputSampleRate: 16000, outputEncoding: "pcmFormatInt16" } }
          : {}),
      });
    } catch (error) {
      this.active = false;
      this.update({ status: "error", error: (error as Error).message });
    }
  }

  private attachListeners() {
    if (!this.native || this.subscriptions.length) return;
    const on = (name: string, fn: (event: any) => void) =>
      this.subscriptions.push(this.native!.addListener(name, fn));

    on("start", () => {
      if (this.active) this.update({ status: "listening" });
    });
    on("audiostart", (event: { timestamp?: number } | null) => {
      if (this.snapshot.audioStartedAtMs == null) {
        this.update({ audioStartedAtMs: event?.timestamp ?? this.clock.now() });
      }
    });
    on("audioend", (event: { uri?: string | null } | null) => {
      if (event?.uri && this.options?.persistAudio) this.recordings.push(event.uri);
    });
    on("result", (event: { isFinal: boolean; results: { transcript: string }[] }) => {
      const transcript = event.results?.[0]?.transcript ?? "";
      this.update({
        transcript: reduceResult(this.snapshot.transcript, { isFinal: event.isFinal, transcript }, this.clock.now()),
      });
    });
    on("volumechange", (event: { value: number }) => {
      if (this.active) this.volumeSamples.push({ tMs: this.clock.now() - this.attemptStartedAt, value: event.value });
      this.volumeListeners.forEach((fn) => fn(event.value));
      this.update({ volume: event.value });
    });
    on("error", (event: { error: string; message?: string }) => this.handleError(event.error, event.message));
    on("end", () => this.handleEnd());
  }

  private handleError(code: string, message?: string) {
    if (this.stopRequested && code === "aborted") return;
    if (code === "not-allowed" || code === "service-not-allowed") {
      this.active = false;
      this.update({ status: "permission-denied", error: message ?? code });
      return;
    }
    if (code === "interrupted") {
      this.active = false;
      this.update({ status: "paused", error: null });
      return;
    }
    if (code === "language-not-supported" && this.options?.preferOnDevice) {
      // On-device model missing for this locale — fall back to server
      // recognition once instead of failing the attempt.
      this.options = { ...this.options, preferOnDevice: false };
      this.update({ onDevice: false });
      return; // the following `end` restarts with the new options
    }
    if (BENIGN_ERRORS.has(code)) return; // `end` follows and restarts
    this.active = false;
    this.update({ status: "error", error: message ?? code });
  }

  private handleEnd() {
    const waiters = this.endWaiters;
    this.endWaiters = [];
    waiters.forEach((resolve) => resolve());
    if (this.stopRequested || !this.active || !this.options) return;

    if (!this.options.keepAlive || this.snapshot.restarts >= this.options.maxRestarts) {
      this.active = false;
      this.update({
        status: "error",
        error: "Speech recognition kept stopping. Tap Stop to score what was heard.",
      });
      return;
    }

    const ranFor = this.clock.now() - this.taskStartedAt;
    this.fastFails = ranFor < FAST_FAIL_MS ? this.fastFails + 1 : 0;
    const delay = this.fastFails === 0 ? 0 : Math.min(100 * 2 ** this.fastFails, 1000);
    this.update({
      status: "restarting",
      restarts: this.snapshot.restarts + 1,
      transcript: beginTask(this.snapshot.transcript, this.clock.now()),
    });
    this.restartTimer = this.clock.setTimeout(() => {
      this.restartTimer = null;
      if (this.active) this.startNative();
    }, delay);
  }

  private clearRestartTimer() {
    if (this.restartTimer != null) {
      this.clock.clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }
}

function safeAvailable(native: SpeechNative): boolean {
  try {
    return native.isRecognitionAvailable();
  } catch {
    return false;
  }
}

function safeSupportsOnDevice(native: SpeechNative): boolean {
  try {
    return native.supportsOnDeviceRecognition();
  } catch {
    return false;
  }
}
