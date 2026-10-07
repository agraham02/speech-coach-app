import { summarizeVolume, uniqueContentWords, usedWord } from "../dsp/volumePauses";

function readings(pattern: string, stepMs = 100) {
  // "x" = speech (value 5), "." = silence (value -1)
  return pattern.split("").map((c, i) => ({ tMs: i * stepMs, value: c === "x" ? 5 : -1 }));
}

describe("summarizeVolume", () => {
  it("finds pauses between speech and ignores leading/trailing silence", () => {
    const s = summarizeVolume(readings("...xxxx.....xxxx..xxx...."), 400);
    expect(s.speechStartMs).toBe(300);
    expect(s.pauses).toEqual([{ startMs: 700, durationMs: 500 }]);
    expect(s.spokeRatio).toBeCloseTo(11 / 18);
  });

  it("measures time at a projection target", () => {
    const r = [5, 8, 8, 2].map((value, i) => ({ tMs: i * 100, value }));
    expect(summarizeVolume(r, 300, 6).fractionAtTarget).toBe(0.5);
  });

  it("handles silence", () => {
    expect(summarizeVolume(readings("....."), 300).speechStartMs).toBeNull();
  });
});

describe("fluency helpers", () => {
  it("counts unique content words, folding plurals", () => {
    expect(uniqueContentWords("um cat dog cats the horse dog".split(" "))).toEqual(["cat", "dog", "horse"]);
    expect(uniqueContentWords("sun moon star stone".split(" "), "s")).toEqual(["sun", "star", "stone"]);
  });

  it("detects a story word in inflected forms", () => {
    expect(usedWord(["two", "umbrellas"], "umbrella")).toBe(true);
    expect(usedWord(["dancing"], "dance")).toBe(true);
    expect(usedWord(["bridge"], "volcano")).toBe(false);
  });
});
