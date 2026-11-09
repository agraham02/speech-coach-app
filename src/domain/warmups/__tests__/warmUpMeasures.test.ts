import { hissRound, patakaRate, scoreBreathWarmUp, scoreMeasuredWarmUp, sirenRange, type MeasuredWindow } from "../warmUpMeasures";

// A fake feature track at 10 ms a frame: quiet at -60 dB unless painted.
function track(seconds: number) {
  const n = Math.round(seconds * 100);
  return { hopMs: 10, offsetMs: 0, levelDb: new Float32Array(n).fill(-60), f0Hz: new Float32Array(n), noiseFloorDb: -60, peaks: new Int32Array(0) };
}
type T = ReturnType<typeof track>;
const paint = (t: T, fromS: number, toS: number, db: (i: number) => number) => {
  for (let i = Math.round(fromS * 100); i < Math.round(toS * 100); i++) t.levelDb[i] = db(i);
};
const win = (measure: MeasuredWindow["measure"], startS: number, endS: number): MeasuredWindow => ({ measure, startMs: startS * 1000, endMs: endS * 1000 });

describe("Steady hiss", () => {
  it("a full, even 10-second hiss is full marks", () => {
    const t = track(14);
    paint(t, 2, 12, () => -30);
    const r = hissRound(t, win("hiss", 1, 13), 10);
    expect(r.seconds).toBeCloseTo(10, 1);
    expect(r.score).toBeCloseTo(1, 2);
  });

  it("a hiss that starts a little late still reaches full marks", () => {
    const t = track(14);
    paint(t, 2.8, 12, () => -30); // 9.2 s of a 10 s step
    expect(hissRound(t, win("hiss", 2, 12), 10).score).toBeCloseTo(1, 2);
  });

  it("a 5-second hiss gets about half", () => {
    const t = track(14);
    paint(t, 2, 7, () => -30);
    expect(hissRound(t, win("hiss", 1, 13), 10).score).toBeCloseTo(0.56, 1);
  });

  it("an uneven hiss loses the evenness share", () => {
    const t = track(14);
    paint(t, 2, 12, (i) => (i % 40 < 20 ? -20 : -40));
    const r = hissRound(t, win("hiss", 1, 13), 10);
    expect(r.spreadDb).toBeGreaterThan(8);
    expect(r.score).toBeCloseTo(0.7, 1);
  });

  it("a short wobble doesn't end the hiss; a real stop does", () => {
    const t = track(14);
    paint(t, 2, 12, () => -30);
    paint(t, 5, 5.1, () => -60); // 100 ms dip
    expect(hissRound(t, win("hiss", 1, 13), 10).seconds).toBeCloseTo(10, 1);
    paint(t, 7, 8, () => -60); // a full second's stop: the longest run is now 2 to 7 s
    expect(hissRound(t, win("hiss", 1, 13), 10).seconds).toBeCloseTo(5, 1);
  });

  it("only reads its own window", () => {
    const t = track(30);
    paint(t, 20, 29, () => -30);
    expect(hissRound(t, win("hiss", 0, 15), 10).seconds).toBe(0);
  });
});

describe("Pa-ta-ka", () => {
  it("syllables a second between the first and last", () => {
    const t = track(10);
    t.peaks = Int32Array.from(Array.from({ length: 21 }, (_, i) => 100 + i * 20)); // every 200 ms for 4 s
    const r = patakaRate(t, win("pataka", 0, 10));
    expect(r.rate).toBeCloseTo(5, 1);
    expect(scoreMeasuredWarmUp(t, [win("pataka", 0, 10)]).score).toBe(1);
  });

  it("slow pa-ta-ka scores in proportion", () => {
    const t = track(10);
    t.peaks = Int32Array.from(Array.from({ length: 11 }, (_, i) => 100 + i * 40)); // 2.5 a second
    expect(scoreMeasuredWarmUp(t, [win("pataka", 0, 10)]).score).toBeCloseTo(0.5, 2);
  });

  it("a burst too short to time scores 0 but counts as heard", () => {
    const t = track(10);
    t.peaks = Int32Array.from([100, 120, 140, 160, 180, 200, 220]); // 1.2 s
    const s = scoreMeasuredWarmUp(t, [win("pataka", 0, 10)]);
    expect(s.gate.passed).toBe(true);
    expect(s.score).toBe(0);
  });
});

describe("Siren", () => {
  it("an octave and a half is full marks; the stray ends don't count", () => {
    const t = track(10);
    for (let i = 100; i < 500; i++) t.f0Hz[i] = 110 * Math.pow(2, ((i - 100) / 400) * 1.5);
    t.f0Hz[99] = 30; // an octave error at the bottom
    const r = sirenRange(t, win("siren", 0, 10));
    expect(r.semitones).toBeGreaterThan(14);
    expect(r.semitones).toBeLessThan(18);
    expect(scoreMeasuredWarmUp(t, [win("siren", 0, 10)]).score).toBe(1);
  });

  it("a flat hum isn't a siren", () => {
    const t = track(10);
    for (let i = 100; i < 500; i++) t.f0Hz[i] = 150;
    expect(scoreMeasuredWarmUp(t, [win("siren", 0, 10)]).score).toBe(0);
  });

  it("nothing voiced is not scored", () => {
    const s = scoreMeasuredWarmUp(track(10), [win("siren", 0, 10)]);
    expect(s.score).toBeNull();
    expect(s.gate.passed).toBe(false);
  });
});

describe("the warm-up's number", () => {
  it("averages its rounds, a skipped round counting 0", () => {
    const t = track(40);
    paint(t, 2, 12, () => -30);
    paint(t, 16, 26, () => -30);
    const s = scoreMeasuredWarmUp(t, [win("hiss", 1, 13), win("hiss", 15, 27), win("hiss", 29, 30)]);
    expect(s.score).toBeCloseTo(0.67, 1);
    expect(s.parts.map((p) => p.note)[2]).toBe("Not heard");
  });

  it("silence in every window is not scored, and says why", () => {
    const s = scoreMeasuredWarmUp(track(40), [win("hiss", 1, 13), win("hiss", 15, 27)]);
    expect(s.score).toBeNull();
    expect(s.gate).toMatchObject({ passed: false, kind: "failed" });
  });

  it("a breathing warm-up counts rounds finished", () => {
    expect(scoreBreathWarmUp(3, 4).score).toBe(0.75);
    expect(scoreBreathWarmUp(5, 4).score).toBe(1);
    expect(scoreBreathWarmUp(0, 4)).toMatchObject({ score: null, gate: { passed: false } });
  });
});
