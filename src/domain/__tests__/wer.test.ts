import { countFillers, encodeWavPcm16, fillerRetention, wordErrorRate } from "../eval/wer";

describe("wordErrorRate", () => {
  it("is 0 for a perfect match, ignoring case and punctuation", () => {
    expect(wordErrorRate("Hello, world.", "hello world")).toBe(0);
  });
  it("counts substitutions, deletions and insertions", () => {
    expect(wordErrorRate("the cat sat down", "the bat sat")).toBe(0.5);
    expect(wordErrorRate("a b", "a b c d")).toBe(1);
  });
});

describe("fillers", () => {
  it("counts and compares filler retention", () => {
    expect(countFillers("um so uh I think, umm, yes")).toBe(3);
    expect(fillerRetention("um so uh yes", "so uh yes")).toBe(0.5);
    expect(fillerRetention("so yes", "so yes")).toBeNull();
  });
});

describe("encodeWavPcm16", () => {
  it("writes a valid 44-byte header and 16-bit samples", () => {
    const wav = encodeWavPcm16(new Float32Array([0, 1, -1]), 16000);
    expect(wav.length).toBe(44 + 6);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    const view = new DataView(wav.buffer);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(view.getInt16(48, true)).toBe(-32768);
  });
});
