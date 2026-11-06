import { boundaryRateOf, mergePauses } from "../pauseMerge";
import { pausesFromFeatures } from "../pauses";
import { pausedReading } from "../../signalLab/__tests__/syntheticFeatures";
import type { TranscriptWord } from "../../sessionTypes";

const w = (text: string, startMs: number, endMs: number): TranscriptWord => ({ text, startMs, endMs });

describe("mergePauses", () => {
  it("tags what each detector saw and what both saw", () => {
    const words = [w("a", 0, 500), w("b", 600, 1000), w("c", 1700, 2000), w("d", 3000, 3300)];
    // word gaps: 600-... none (100 ms); 1000-1700 (700 ms); 2000-3000 (1000 ms)
    const energy = [
      { startMs: 1050, endMs: 1650 }, // inside the first gap: both
      { startMs: 5000, endMs: 5400 }, // alone
    ];
    expect(mergePauses(energy, words)).toEqual([
      { startMs: 1000, endMs: 1700, durationMs: 700, source: "both" },
      { startMs: 2000, endMs: 3000, durationMs: 1000, source: "words" },
      { startMs: 5000, endMs: 5400, durationMs: 400, source: "energy" },
    ]);
  });

  it("joins overlapping intervals into their union and counts each pause once", () => {
    const words = [w("a", 0, 1000), w("b", 1500, 2000)]; // gap 1000-1500
    const merged = mergePauses([{ startMs: 1300, endMs: 1900 }, { startMs: 1200, endMs: 1400 }], words);
    expect(merged).toEqual([{ startMs: 1000, endMs: 1900, durationMs: 900, source: "both" }]);
  });

  it("ignores gaps and energy pauses shorter than the minimum", () => {
    const words = [w("a", 0, 1000), w("b", 1250, 2000)];
    expect(mergePauses([{ startMs: 3000, endMs: 3200 }], words)).toEqual([]);
    expect(mergePauses([{ startMs: 3000, endMs: 3200 }], words, 200)).toHaveLength(2);
    expect(mergePauses([], words, 250)).toHaveLength(1);
  });

  it("works without words, and with nothing at all", () => {
    expect(mergePauses([{ startMs: 100, endMs: 600 }], null)).toEqual([{ startMs: 100, endMs: 600, durationMs: 500, source: "energy" }]);
    expect(mergePauses([], null)).toEqual([]);
    expect(mergePauses([], [])).toEqual([]);
  });

  it("sorts its output", () => {
    const merged = mergePauses([{ startMs: 5000, endMs: 5500 }, { startMs: 100, endMs: 600 }], null);
    expect(merged.map((p) => p.startMs)).toEqual([100, 5000]);
  });
});

describe("boundaryRateOf", () => {
  const words = ["one.", "two", "three.", "four", "five."];
  const r = pausedReading(words, { 0: { ms: 600 }, 2: { ms: 600, heard: false }, 4: { ms: 0 } });

  it("matches boundaryPauseRate in pauses.ts when fed the same pauses", () => {
    const analysis = pausesFromFeatures(r.features, r.words);
    expect(boundaryRateOf(analysis.pauses, r.words)).toBe(analysis.boundaryPauseRate);
    const none = pausesFromFeatures(r.features, null);
    expect(none.pauses.length).toBeGreaterThan(0);
  });

  it("rises when Whisper's gaps cover a pause the energy gate missed", () => {
    const energy = pausesFromFeatures(r.features, r.words).pauses;
    expect(energy).toHaveLength(1);
    const merged = mergePauses(energy, r.words);
    expect(merged).toHaveLength(2);
    expect(merged.map((p) => p.source)).toEqual(["both", "words"]);
    expect(boundaryRateOf(energy, r.words)).toBe(0.5);
    expect(boundaryRateOf(merged, r.words)).toBe(1);
  });

  it("is null with too few words or no sentence ending", () => {
    expect(boundaryRateOf([], null)).toBeNull();
    expect(boundaryRateOf([], [w("hi.", 0, 100)])).toBeNull();
    expect(boundaryRateOf([], [w("hi", 0, 100), w("there", 200, 300)])).toBeNull();
  });

  it("allows 120 ms early and 400 ms late, no more", () => {
    const ws = [w("end.", 0, 1000), w("next", 2000, 2200)];
    expect(boundaryRateOf([{ startMs: 880, endMs: 1500 }], ws)).toBe(1);
    expect(boundaryRateOf([{ startMs: 879, endMs: 1500 }], ws)).toBe(0);
    expect(boundaryRateOf([{ startMs: 1400, endMs: 1900 }], ws)).toBe(1);
    expect(boundaryRateOf([{ startMs: 1401, endMs: 1900 }], ws)).toBe(0);
  });
});
