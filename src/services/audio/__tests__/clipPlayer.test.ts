const events: string[] = [];
const sources: { onEnded: (() => void) | null; stop: () => void }[] = [];

jest.mock("react-native-audio-api", () => ({
  AudioManager: {
    setAudioSessionOptions: jest.fn((options: { iosCategory: string }) => events.push(`session:${options.iosCategory}`)),
  },
  AudioContext: jest.fn().mockImplementation(() => ({
    destination: {},
    resume: jest.fn(async () => {
      events.push("resume");
      return true;
    }),
    suspend: jest.fn(async () => {
      events.push("suspend");
      return true;
    }),
    decodeAudioData: jest.fn(async () => ({})),
    createBufferSource: jest.fn(() => {
      const source = {
        buffer: null as unknown,
        playbackRate: { value: 1 },
        onEnded: null as (() => void) | null,
        connect: jest.fn(),
        start: jest.fn(() => events.push("start")),
        stop: jest.fn(() => events.push("stop")),
      };
      sources.push(source);
      return source;
    }),
  })),
}));

jest.mock("../../../utils/logger", () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

import { loadClip, playClip, startClip, stopClip } from "../clipPlayer";

beforeEach(() => {
  events.length = 0;
});

describe("clipPlayer", () => {
  it("asks for the playback session, and resumes before every clip", async () => {
    expect(await playClip("file:///a.wav")).toBe(true);
    expect(events.slice(0, 3)).toEqual(["session:playback", "resume", "start"]);
    sources[sources.length - 1].onEnded?.();
    events.length = 0;
    expect(await playClip("file:///b.wav")).toBe(true);
    expect(events).toContain("resume");
  });

  it("suspends once a clip ends, so the next one sets the session again", async () => {
    const onEnded = jest.fn();
    await playClip("file:///a.wav", onEnded);
    sources[sources.length - 1].onEnded?.();
    expect(onEnded).toHaveBeenCalled();
    expect(events[events.length - 1]).toBe("suspend");
  });

  it("suspends when stopped", async () => {
    await playClip("file:///a.wav");
    events.length = 0;
    stopClip();
    expect(events).toEqual(["stop", "suspend"]);
  });

  it("doesn't suspend under a clip that replaced the last one", async () => {
    await playClip("file:///a.wav");
    const first = sources[sources.length - 1];
    await playClip("file:///b.wav");
    events.length = 0;
    // The first clip's end arrives after the second started.
    first.onEnded?.();
    expect(events).not.toContain("suspend");
  });

  it("leaves the engine suspended after loading a clip for the Rewind player", async () => {
    stopClip();
    events.length = 0;
    expect(await loadClip("file:///rewind.wav")).not.toBeNull();
    expect(events[events.length - 1]).toBe("suspend");
  });

  it("resumes before a seek starts, and suspends once it plays to the end", async () => {
    const buffer = (await loadClip("file:///rewind.wav"))!;
    events.length = 0;
    const onFinished = jest.fn();
    expect(await startClip(buffer, { offsetMs: 5000, rate: 1.5, onPosition: jest.fn(), onFinished })).toBe(true);
    // The session is set again before every start: the live conversation's
    // partner voice (partnerAudio.ts) sets its own in between.
    expect(events).toEqual(["session:playback", "resume", "start"]);
    sources[sources.length - 1].onEnded?.();
    expect(onFinished).toHaveBeenCalled();
    expect(events[events.length - 1]).toBe("suspend");
  });
});
