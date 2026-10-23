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

import { playClip, stopClip } from "../clipPlayer";

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
});
