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
    // A 4 st rise across the 320 ms word: about 12.5 st/s over the whole word,
    // a little less over its last 300 ms.
    const rise = terminalSlope(take.features, take.sentenceEndsMs[1])!;
    expect(rise).toBeGreaterThan(10);
    expect(rise).toBeLessThan(14);
  });

  it("copes with a transcript end that lands after the voice stops", () => {
    expect(terminalSlope(take.features, take.sentenceEndsMs[0] + 150)!).toBeLessThan(-8);
    expect(terminalSlope(take.features, take.sentenceEndsMs[1] + 150)!).toBeGreaterThan(8);
  });

  it("gives no slope when the voice stopped well before the end, or there is too little of it", () => {
    expect(terminalSlope(take.features, take.sentenceEndsMs[0] + 500)).toBeNull();
    const brief = buildFeatures([{ ms: 100, kind: "pause" }, { ms: 60, f0: 120 }, { ms: 300, kind: "pause" }]);
    expect(terminalSlope(brief, 160)).toBeNull();
    expect(terminalSlope(brief, 20)).toBeNull();
    expect(terminalSlope(buildFeatures([{ ms: 500, kind: "pause" }]), 400)).toBeNull();
  });

  it("only looks at the window", () => {
    // Falls hard early, then holds level for the last 300 ms.
    const f = buildFeatures([{ ms: 1000, f0: (t) => (t < 700 ? 200 - t * 0.1 : 130) }]);
    expect(Math.abs(terminalSlope(f, 1000)!)).toBeLessThan(1);
    expect(terminalSlope(f, 600, { windowMs: 300 })!).toBeLessThan(-8);
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
