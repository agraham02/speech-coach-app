import { classifyEnding, ENDING_SLOPE_ST_PER_S, terminalSlope } from "../endings";
import { buildFeatures, sentenceTake } from "../../signalLab/__tests__/syntheticFeatures";

describe("terminalSlope", () => {
  const take = sentenceTake(["falling", "rising", "flat", "falling", "rising"]);

  it("is negative for a falling ending, positive for a rising one and near zero for a flat one", () => {
    const [fall, rise, flat] = [0, 1, 2].map((s) => terminalSlope(take.features, take.sentenceEndsMs[s]));
    expect(fall).not.toBeNull();
    expect(fall!).toBeLessThan(-8);
    expect(rise!).toBeGreaterThan(8);
    expect(Math.abs(flat!)).toBeLessThan(1);
  });

  it("is in semitones per second", () => {
    // Doubling every second is 12 semitones a second.
    const f = buildFeatures([{ ms: 1000, f0: (t) => 100 * 2 ** (t / 1000) }]);
    expect(terminalSlope(f, 1000)!).toBeCloseTo(12, 0);
  });

  it("isn't turned around by a stray frame in a creaky ending", () => {
    const fall = (t: number) => (t > 880 && t < 910 ? 170 : 120 - t * 0.04);
    const f = buildFeatures([{ ms: 1000, f0: fall }]);
    expect(terminalSlope(f, 1000)!).toBeLessThan(-3);
  });

  it("reads up to the pause when Whisper ended the word early", () => {
    // Level until 800 ms, then a rise Whisper's word end at 800 misses.
    const f = buildFeatures([{ ms: 1100, f0: (t) => (t < 800 ? 100 : 100 * 2 ** ((t - 800) / 400)) }, { ms: 500, kind: "pause" }]);
    expect(terminalSlope(f, 800, { searchAheadMs: 0 })!).toBeLessThan(3);
    expect(terminalSlope(f, 800)!).toBeGreaterThanOrEqual(3);
  });

  it("reads back to the pause when Whisper ended the word at the next sentence", () => {
    const f = buildFeatures([
      { ms: 800, f0: (t) => 140 - t * 0.05 },
      { ms: 500, kind: "pause" },
      { ms: 800, f0: (t) => 100 + t * 0.1 },
    ]);
    expect(terminalSlope(f, 1320)!).toBeLessThan(-3);
  });

  it("uses Whisper's end when there is no pause near it", () => {
    const f = buildFeatures([{ ms: 3000, f0: (t) => (t < 1500 ? 100 + t * 0.05 : 175 - (t - 1500) * 0.03) }]);
    expect(terminalSlope(f, 1500)!).toBeGreaterThan(3);
  });

  it("copes with a transcript end that lands after the voice stops", () => {
    expect(terminalSlope(take.features, take.sentenceEndsMs[0] + 150)!).toBeLessThan(-8);
    expect(terminalSlope(take.features, take.sentenceEndsMs[1] + 150)!).toBeGreaterThan(8);
  });

  it("gives no slope when the voice stopped long before the end, or there is too little of it", () => {
    const longAgo = buildFeatures([{ ms: 600, f0: 120 }, { ms: 3000, kind: "pause" }]);
    expect(terminalSlope(longAgo, 3000)).toBeNull();
    const brief = buildFeatures([{ ms: 100, kind: "pause" }, { ms: 60, f0: 120 }, { ms: 300, kind: "pause" }]);
    expect(terminalSlope(brief, 160)).toBeNull();
    expect(terminalSlope(brief, 20)).toBeNull();
    expect(terminalSlope(buildFeatures([{ ms: 500, kind: "pause" }]), 400)).toBeNull();
  });

  it("only looks at the window", () => {
    // Falls hard early, then holds level for the last 500 ms.
    const f = buildFeatures([{ ms: 1000, f0: (t) => (t < 500 ? 200 - t * 0.14 : 130) }]);
    expect(Math.abs(terminalSlope(f, 1000)!)).toBeLessThan(1);
    expect(terminalSlope(f, 500, { windowMs: 300, searchAheadMs: 0 })!).toBeLessThan(-8);
  });
});

describe("classifyEnding", () => {
  it("uses 3 st/s either way", () => {
    expect(ENDING_SLOPE_ST_PER_S).toBe(3);
    expect(classifyEnding(3)).toBe("rising");
    expect(classifyEnding(2.99)).toBe("flat");
    expect(classifyEnding(0)).toBe("flat");
    expect(classifyEnding(-2.99)).toBe("flat");
    expect(classifyEnding(-3)).toBe("falling");
    expect(classifyEnding(-15)).toBe("falling");
  });

  it("says nothing without a slope", () => {
    expect(classifyEnding(null)).toBeNull();
    expect(classifyEnding(NaN)).toBeNull();
  });

  it("reads synthetic sentences right", () => {
    const take = sentenceTake(["falling", "rising", "falling", "rising"]);
    const kinds = take.sentenceEndsMs.map((e) => classifyEnding(terminalSlope(take.features, e)));
    expect(kinds).toEqual(["falling", "rising", "falling", "rising"]);
  });
});
