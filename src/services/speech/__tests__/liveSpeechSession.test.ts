import { LiveSpeechSession, type LiveSpeechClock, type SpeechNative } from "../liveSpeechSession";

class FakeNative implements SpeechNative {
  listeners = new Map<string, Set<(event: any) => void>>();
  starts: Record<string, unknown>[] = [];
  stops = 0;
  aborts = 0;
  endOnStop = true;

  start(options: Record<string, unknown>) {
    this.starts.push(options);
    this.emit("start", null);
  }
  stop() {
    this.stops += 1;
    if (this.endOnStop) this.emit("end", null);
  }
  abort() {
    this.aborts += 1;
  }
  async requestPermissionsAsync() {
    return { granted: true };
  }
  isRecognitionAvailable() {
    return true;
  }
  supportsOnDeviceRecognition() {
    return true;
  }
  addListener(name: string, fn: (event: any) => void) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(fn);
    return { remove: () => this.listeners.get(name)!.delete(fn) };
  }
  emit(name: string, event: unknown) {
    this.listeners.get(name)?.forEach((fn) => fn(event));
  }
  result(transcript: string, isFinal: boolean) {
    this.emit("result", { isFinal, results: [{ transcript }] });
  }
}

class FakeClock implements LiveSpeechClock {
  time = 0;
  timers: { at: number; fn: () => void; id: number }[] = [];
  nextId = 1;
  now() {
    return this.time;
  }
  setTimeout(fn: () => void, ms: number) {
    const id = this.nextId++;
    this.timers.push({ at: this.time + ms, fn, id });
    return id;
  }
  clearTimeout(id: unknown) {
    this.timers = this.timers.filter((t) => t.id !== id);
  }
  advance(ms: number) {
    this.time += ms;
    const due = this.timers.filter((t) => t.at <= this.time);
    this.timers = this.timers.filter((t) => t.at > this.time);
    due.forEach((t) => t.fn());
  }
}

function setup() {
  const native = new FakeNative();
  const clock = new FakeClock();
  const session = new LiveSpeechSession(native, clock);
  return { native, clock, session };
}

describe("LiveSpeechSession", () => {
  it("starts in continuous, on-device mode with context words", () => {
    const { native, session } = setup();
    session.start({ contextualStrings: ["sheikh"] });
    expect(native.starts[0]).toMatchObject({
      continuous: true,
      interimResults: true,
      requiresOnDeviceRecognition: true,
      contextualStrings: ["sheikh"],
    });
    expect(session.getSnapshot().status).toBe("listening");
  });

  it("sets its own iOS audio session on every start, never the call profile", () => {
    const { native, clock, session } = setup();
    session.start();
    clock.advance(3000);
    native.emit("end", null);
    clock.advance(0);
    expect(native.starts).toHaveLength(2);
    for (const options of native.starts) {
      const category = options.iosCategory as { category: string; categoryOptions: string[]; mode: string };
      expect(category.category).toBe("playAndRecord");
      expect(category.categoryOptions).toContain("defaultToSpeaker");
      // allowBluetooth is HFP: AirPods would record and play at call quality.
      expect(category.categoryOptions).not.toContain("allowBluetooth");
      expect(["voiceChat", "videoChat"]).not.toContain(category.mode);
    }
  });

  it("saves takes at full rate, not 16 kHz", () => {
    const native = Object.assign(new FakeNative(), { supportsRecording: () => true });
    const session = new LiveSpeechSession(native, new FakeClock());
    session.start({ persistAudio: true });
    expect(native.starts[0]).toMatchObject({
      recordingOptions: { persist: true, outputSampleRate: 48000, outputEncoding: "pcmFormatInt16" },
    });
  });

  it("restarts after an unexpected end and keeps earlier words", () => {
    const { native, clock, session } = setup();
    session.start();
    clock.advance(3000);
    native.result("she sells", false);
    native.emit("error", { error: "no-speech" });
    native.emit("end", null); // recognizer gave up at a pause
    expect(session.getSnapshot().status).toBe("restarting");
    clock.advance(0);
    expect(native.starts).toHaveLength(2);
    native.result("seashells", true);
    expect(session.getSnapshot().text).toBe("she sells seashells");
  });

  it("backs off when the recognizer keeps failing immediately", () => {
    const { native, clock, session } = setup();
    session.start();
    native.emit("end", null);
    clock.advance(199);
    expect(native.starts).toHaveLength(1);
    clock.advance(1);
    expect(native.starts).toHaveLength(2);
  });

  it("stop waits for the trailing final and resolves once", async () => {
    const { native, session } = setup();
    native.endOnStop = false;
    session.start();
    native.result("toy boat toy", false);
    const first = session.stop();
    const second = session.stop();
    expect(first).toBe(second);
    native.result("toy boat toy boat", true);
    native.emit("end", null);
    const transcript = await first;
    expect(transcript.committed.map((u) => u.text)).toEqual(["toy boat toy boat"]);
    expect(session.getSnapshot().status).toBe("stopped");
    expect(native.starts).toHaveLength(1); // no restart after a requested stop
  });

  it("promotes the partial if no final arrives before the grace period", async () => {
    const { native, clock, session } = setup();
    native.endOnStop = false;
    session.start();
    native.result("red lorry yellow", false);
    const pending = session.stop(1000);
    clock.advance(1000);
    const transcript = await pending;
    expect(transcript.committed.map((u) => u.text)).toEqual(["red lorry yellow"]);
    expect(native.aborts).toBe(1);
  });

  it("treats permission errors as terminal", () => {
    const { native, session } = setup();
    session.start();
    native.emit("error", { error: "not-allowed" });
    native.emit("end", null);
    expect(session.getSnapshot().status).toBe("permission-denied");
    expect(native.starts).toHaveLength(1);
  });

  it("pauses on interruption and resumes without losing text", () => {
    const { native, clock, session } = setup();
    session.start();
    native.result("fred fed", true);
    native.emit("error", { error: "interrupted" });
    native.emit("end", null);
    expect(session.getSnapshot().status).toBe("paused");
    session.resume();
    clock.advance(0);
    native.result("ted bread", true);
    expect(session.getSnapshot().text).toBe("fred fed ted bread");
  });

  it("falls back to server recognition when the locale lacks an on-device model", () => {
    const { native, clock, session } = setup();
    session.start();
    native.emit("error", { error: "language-not-supported" });
    native.emit("end", null);
    clock.advance(1000);
    expect(native.starts[1]).toMatchObject({ requiresOnDeviceRecognition: false });
  });

  it("reports unavailable without a native module", () => {
    const session = new LiveSpeechSession(null);
    expect(session.getSnapshot().status).toBe("unavailable");
  });
});
