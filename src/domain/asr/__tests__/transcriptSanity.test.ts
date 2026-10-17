import { describeTranscriptProblems, findTranscriptProblems } from "../transcriptSanity";
import { pcm16FromFloat32 } from "../pcm";

const kinds = (input: Parameters<typeof findTranscriptProblems>[0]) => findTranscriptProblems(input).map((p) => p.kind);

// Outputs from a real ASR Lab run where whisper.rn was handed float samples
// it read as 16-bit ones: twice the length, all noise.
describe("findTranscriptProblems", () => {
  it("passes a normal transcript", () => {
    const text = Array.from({ length: 30 }, (_, i) => "Point " + i + " was about running before work.").join(" ");
    expect(kinds({ text, words: [{ text: "year", startMs: 58000, endMs: 59500 }], audioSeconds: 60 })).toEqual([]);
  });

  it("flags words that run past the end of the audio", () => {
    const problems = findTranscriptProblems({
      text: "So, let us go. ".repeat(20),
      words: [{ text: "go.", startMs: 109210, endMs: 119900 }],
      audioSeconds: 59.96,
    });
    expect(problems[0]).toEqual({ kind: "runs_past_audio", detail: "words run to 119.9 s of 60.0 s of audio" });
  });

  it("flags descriptions of noise", () => {
    expect(kinds({ text: "*Sounds of the water* *Sounds of water* So, let us go.", audioSeconds: 5 })).toContain("sound_tags");
    expect(kinds({ text: "(dryer (airplane engine. The air conditioning is [BREAKING SOUND]", audioSeconds: 5 })).toContain("sound_tags");
  });

  it("allows one aside in a long transcript", () => {
    expect(kinds({ text: "I told them [laughs] and then we went home and talked about it for a long while", audioSeconds: 5 })).toEqual([]);
  });

  it("flags a decoder loop", () => {
    const problems = findTranscriptProblems({ text: "Um, I mean, yeah. Um, I mean, yeah. Um, I mean, yeah. Um, I mean, yeah.", audioSeconds: 5 });
    expect(problems.map((p) => p.kind)).toEqual(["looping"]);
    expect(problems[0].detail).toBe('repeats "um i mean yeah"');
  });

  it("flags far too few words for the length", () => {
    expect(kinds({ text: "So let us go so let us go now please", audioSeconds: 60 })).toEqual(["too_few_words"]);
    // Short takes are not judged on rate.
    expect(kinds({ text: "Hi", audioSeconds: 10 })).toEqual([]);
  });

  it("describes problems in one line", () => {
    expect(describeTranscriptProblems([])).toBeNull();
    expect(describeTranscriptProblems([{ kind: "too_few_words", detail: "9 words in 60 s" }])).toBe("Looks wrong: 9 words in 60 s.");
  });
});

describe("pcm16FromFloat32", () => {
  it("writes two bytes per sample, clamped, little-endian", () => {
    const buffer = pcm16FromFloat32(new Float32Array([0, 1, -1, 2, 0.5]));
    expect(buffer.byteLength).toBe(10);
    const view = new DataView(buffer);
    expect(view.getInt16(0, true)).toBe(0);
    expect(view.getInt16(2, true)).toBe(32767);
    expect(view.getInt16(4, true)).toBe(-32768);
    expect(view.getInt16(6, true)).toBe(32767);
    expect(view.getInt16(8, true)).toBe(16383);
  });
});
