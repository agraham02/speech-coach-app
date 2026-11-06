import { PAUSE, SPEECH } from "../audioFeatures";
import { phrasePitchVariation, splitPhrases } from "../phrasePitch";
import { summarizePitch } from "../pitchTracker";
import { buildFeatures, phraseTake } from "../../signalLab/__tests__/syntheticFeatures";

describe("splitPhrases", () => {
  it("splits at pauses of 300 ms and keeps shorter gaps inside the phrase", () => {
    const f = buildFeatures([
      { ms: 200, kind: "pause" },
      { ms: 500, f0: 120 },
      { ms: 200, kind: "pause" },
      { ms: 500, f0: 120 },
      { ms: 300, kind: "pause" },
      { ms: 500, f0: 120 },
      { ms: 200, kind: "pause" },
    ]);
    const spans = splitPhrases(f);
    expect(spans).toHaveLength(2);
    expect(spans[0].startMs).toBe(195);
    expect(spans[0].endMs).toBe(1395);
    expect(spans[1].startMs).toBe(1695);
    expect(f.speech[spans[0].firstFrame]).toBe(SPEECH);
    expect(f.speech[spans[0].firstFrame - 1]).toBe(PAUSE);
  });

  it("returns nothing when nobody speaks", () => {
    expect(splitPhrases(buildFeatures([{ ms: 1000, kind: "pause" }]))).toEqual([]);
  });
});

describe("phrasePitchVariation", () => {
  const flat = phraseTake({ wanderSt: 0.3, seed: 1 }).features;
  const normal = phraseTake({ wanderSt: 1.2, seed: 2 }).features;
  const lively = phraseTake({ wanderSt: 2.2, seed: 3 }).features;

  it("orders flat, normal and lively takes", () => {
    const a = phrasePitchVariation(flat);
    const b = phrasePitchVariation(normal);
    const c = phrasePitchVariation(lively);
    expect(a.usablePhrases).toBe(10);
    expect(a.weightedMeanSdSt!).toBeLessThan(0.8);
    expect(b.weightedMeanSdSt!).toBeGreaterThan(a.weightedMeanSdSt! * 1.5);
    expect(c.weightedMeanSdSt!).toBeGreaterThan(b.weightedMeanSdSt! * 1.3);
    expect(c.medianSdSt!).toBeGreaterThan(b.medianSdSt!);
  });

  it("reports each phrase with its times and voiced frames", () => {
    const r = phrasePitchVariation(normal);
    expect(r.phrases).toHaveLength(10);
    expect(r.phrases[0].startMs).toBeLessThan(r.phrases[0].endMs);
    expect(r.phrases[1].startMs).toBeGreaterThan(r.phrases[0].endMs);
    for (const p of r.phrases) {
      expect(p.voicedFrames).toBeGreaterThanOrEqual(15);
      expect(p.rangeSt).toBeGreaterThan(0);
    }
  });

  it("is not fooled by the key changing between phrases", () => {
    const drifting = phraseTake({ wanderSt: 0.3, driftSt: 6, seed: 4 }).features;
    expect(summarizePitch(drifting).sdSemitones!).toBeGreaterThan(2);
    expect(phrasePitchVariation(drifting).weightedMeanSdSt!).toBeLessThan(0.8);
  });

  it("does not count octave glitches as melody", () => {
    const f = phraseTake({ wanderSt: 0.3, seed: 5 }).features;
    for (let i = 100; i < f.f0Hz.length; i += 97) f.f0Hz[i] *= 2;
    const raw = phrasePitchVariation(f, { clean: false }).weightedMeanSdSt!;
    const cleaned = phrasePitchVariation(f).weightedMeanSdSt!;
    expect(raw).toBeGreaterThan(1);
    expect(cleaned).toBeLessThan(0.8);
  });

  it("weights phrases by their voiced frames", () => {
    const f = buildFeatures([
      { ms: 200, kind: "pause" },
      { ms: 300, f0: (t) => (t < 150 ? 100 : 200) }, // a 12 st step: very variable, short
      { ms: 500, kind: "pause" },
      { ms: 2000, f0: 120 }, // long and steady
      { ms: 200, kind: "pause" },
    ]);
    const r = phrasePitchVariation(f, { clean: false });
    expect(r.usablePhrases).toBe(2);
    const [short, long] = r.phrases;
    expect(short.sdSt).toBeGreaterThan(5);
    expect(long.sdSt).toBe(0);
    expect(r.weightedMeanSdSt!).toBeLessThan(short.sdSt / 2);
    expect(r.medianSdSt).toBe(0);
  });

  it("leaves out phrases with fewer than 15 voiced frames, and is null when none are usable", () => {
    const f = buildFeatures([
      { ms: 200, kind: "pause" },
      { ms: 100, f0: 120 }, // 10 voiced frames
      { ms: 500, kind: "pause" },
      { ms: 400, levelDb: -30 }, // speech with no pitch
      { ms: 200, kind: "pause" },
    ]);
    const r = phrasePitchVariation(f);
    expect(r.totalPhrases).toBe(2);
    expect(r.usablePhrases).toBe(0);
    expect(r.weightedMeanSdSt).toBeNull();
    expect(r.medianSdSt).toBeNull();
    expect(r.phrases).toEqual([]);
  });

  it("copes with a silent take", () => {
    const r = phrasePitchVariation(buildFeatures([{ ms: 1000, kind: "pause" }]));
    expect(r).toMatchObject({ totalPhrases: 0, usablePhrases: 0, weightedMeanSdSt: null, medianSdSt: null });
  });
});
