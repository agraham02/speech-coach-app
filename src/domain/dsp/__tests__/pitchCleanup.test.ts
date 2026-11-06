import { cleanPitch } from "../pitchCleanup";
import { glideFeatures } from "../../signalLab/__tests__/syntheticFeatures";

const steady = (n: number, hz = 120) => new Float32Array(n).fill(hz);

describe("cleanPitch", () => {
  it("moves a frame an octave off back to the octave that fits", () => {
    const f0 = steady(100);
    f0[50] = 240;
    f0[70] = 60;
    const { f0Hz, counts } = cleanPitch(f0);
    expect(f0Hz[50]).toBeCloseTo(120, 3);
    expect(f0Hz[70]).toBeCloseTo(120, 3);
    expect(counts.octaveMoved).toBe(2);
    expect(counts.voicedAfter).toBe(100);
  });

  it("can drop octave jumps instead", () => {
    const f0 = steady(100);
    f0[50] = 240;
    const { f0Hz, counts } = cleanPitch(f0, undefined, { dropOctaveJumps: true });
    expect(f0Hz[50]).toBe(0);
    expect(counts).toMatchObject({ octaveDropped: 1, octaveMoved: 0, voicedBefore: 100, voicedAfter: 99 });
  });

  it("handles a double octave and leaves a jump that fits no octave alone", () => {
    const f0 = steady(100);
    f0[30] = 480;
    f0[60] = 170; // about 6.2 st up: not an octave
    const { f0Hz, counts } = cleanPitch(f0, undefined, { medianFrames: 1 });
    expect(f0Hz[30]).toBeCloseTo(120, 3);
    expect(f0Hz[60]).toBeCloseTo(170, 3);
    expect(counts.octaveMoved).toBe(1);
  });

  it("smooths a one-frame spike with the median filter", () => {
    const f0 = steady(60);
    f0[30] = 150; // 3.9 st: not an octave
    const { f0Hz, counts } = cleanPitch(f0);
    expect(f0Hz[30]).toBeCloseTo(120, 3);
    expect(counts.smoothed).toBe(1);
  });

  it("does not smooth across a gap between voiced runs", () => {
    const f0 = new Float32Array(40);
    f0.fill(100, 0, 10);
    f0.fill(200, 14, 24);
    const { f0Hz } = cleanPitch(f0, undefined, { octaveWindowFrames: 0 });
    expect(f0Hz[9]).toBe(100);
    expect(f0Hz[14]).toBe(200);
    expect(f0Hz[11]).toBe(0);
  });

  it("limits to a personal range when asked", () => {
    const f0 = steady(100);
    f0.fill(180, 40, 43); // 7 st up, 3% of frames
    const off = cleanPitch(f0, undefined, { medianFrames: 1, octaveWindowFrames: 0 });
    expect(off.counts.outOfRange).toBe(0);
    const on = cleanPitch(f0, undefined, { medianFrames: 1, octaveWindowFrames: 0, rangeMarginSt: 1 });
    expect(on.counts.outOfRange).toBe(3);
    expect(on.counts.rangeHz?.hi).toBeLessThan(180);
    expect(on.f0Hz[41]).toBe(0);
  });

  it("drops low-confidence frames when given a floor and never touches its input", () => {
    const f0 = steady(50);
    const conf = new Float32Array(50).fill(0.9);
    conf[10] = 0.1;
    const before = Array.from(f0);
    const { f0Hz, counts } = cleanPitch(f0, conf, { minConfidence: 0.3 });
    expect(f0Hz[10]).toBe(0);
    expect(counts.lowConfidence).toBe(1);
    expect(Array.from(f0)).toEqual(before);
  });

  it("leaves a real glide alone", () => {
    const g = glideFeatures({ seconds: 6 });
    const { f0Hz, counts } = cleanPitch(g.f0Hz, g.confidence);
    expect(counts.octaveMoved + counts.octaveDropped).toBe(0);
    let worst = 0;
    for (let i = 0; i < f0Hz.length; i++) if (g.f0Hz[i] > 0) worst = Math.max(worst, Math.abs(12 * Math.log2(f0Hz[i] / g.f0Hz[i])));
    expect(worst).toBeLessThan(0.5);
  });

  it("copes with nothing voiced", () => {
    const { f0Hz, counts } = cleanPitch(new Float32Array(30), undefined, { rangeMarginSt: 2 });
    expect(Array.from(f0Hz).every((v) => v === 0)).toBe(true);
    expect(counts.voicedBefore).toBe(0);
    expect(counts.rangeHz).toBeNull();
  });
});
