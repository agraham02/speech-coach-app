import { summarizePitch, trackPitch } from "../dsp/pitchTracker";
import { summarizeBuckets } from "../dev/voiceLab";

const FS = 16000;

// A buzzy voiced tone (ten harmonics, falling amplitude) following f0(t),
// with silence around it. Not speech, but periodic in the same way.
function voiced(f0: (t: number) => number, seconds: number, padSeconds = 0.5): Float32Array {
  const pad = Math.round(padSeconds * FS);
  const n = Math.round(seconds * FS);
  const out = new Float32Array(n + 2 * pad);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    phase += (2 * Math.PI * f0(i / FS)) / FS;
    let v = 0;
    for (let h = 1; h <= 10; h++) v += Math.sin(h * phase) / h;
    out[pad + i] = 0.05 * v;
  }
  // A little noise everywhere, so the noise floor is not digital silence.
  let seed = 1;
  for (let i = 0; i < out.length; i++) {
    seed = (seed * 16807) % 2147483647;
    out[i] += ((seed / 2147483647) - 0.5) * 0.0005;
  }
  return out;
}

describe("trackPitch", () => {
  it("finds a steady pitch in nearly every voiced frame", () => {
    const track = trackPitch(voiced(() => 120, 2), FS);
    const inside = track.frames.filter((f) => f.tMs > 600 && f.tMs < 2400);
    const found = inside.filter((f) => f.f0Hz !== null);
    expect(found.length / inside.length).toBeGreaterThan(0.95);
    for (const f of found) expect(Math.abs((f.f0Hz as number) - 120)).toBeLessThan(1.5);
  });

  it("leaves the silence unvoiced", () => {
    const track = trackPitch(voiced(() => 120, 2), FS);
    expect(track.frames.filter((f) => f.tMs < 400).every((f) => f.f0Hz === null)).toBe(true);
  });

  it("reports range in semitones, so a low and a high voice moving the same musical amount match", () => {
    const glide = (base: number) => (t: number) => base * 2 ** ((4 * Math.sin(2 * Math.PI * 0.5 * t)) / 12);
    const low = summarizePitch(trackPitch(voiced(glide(100), 4), FS));
    const high = summarizePitch(trackPitch(voiced(glide(220), 4), FS));
    expect(low.rangeSemitones).not.toBeNull();
    expect(Math.abs((low.rangeSemitones as number) - (high.rangeSemitones as number))).toBeLessThan(0.5);
    // p10-p90 of a 4-semitone sine is about 7.6 semitones.
    expect(low.rangeSemitones as number).toBeGreaterThan(6.5);
    expect(low.rangeSemitones as number).toBeLessThan(8.5);
  });

  it("tells a monotone take from a lively one", () => {
    const flat = summarizePitch(trackPitch(voiced((t) => 110 * 2 ** ((0.5 * Math.sin(2 * Math.PI * t)) / 12), 4), FS));
    const lively = summarizePitch(trackPitch(voiced((t) => 110 * 2 ** ((5 * Math.sin(2 * Math.PI * t)) / 12), 4), FS));
    expect(lively.sdSemitones as number).toBeGreaterThan((flat.sdSemitones as number) * 4);
  });
});

describe("summarizeBuckets", () => {
  it("summarizes a 200 ms contour the way the Voice Lab shows it", () => {
    const s = summarizeBuckets([null, 100, 110, null, 120, 105, null, null], 12);
    expect(s.frames).toBe(8);
    expect(s.voicedPercent).toBe(50);
    expect(s.hzRange).toBe(20);
    expect(s.elapsedMs).toBe(12);
  });
});
