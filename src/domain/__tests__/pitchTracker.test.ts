import { summarizePitch, trackPitch, type PitchTrack } from "../dsp/pitchTracker";
import { FS, synthSpeech, voicedTone } from "./synthSpeech";

const frameTimes = (t: PitchTrack) => Array.from(t.f0Hz, (_, i) => t.offsetMs + i * t.hopMs);
const inside = (t: PitchTrack, fromMs: number, toMs: number) => frameTimes(t).map((ms, i) => ({ ms, f0: t.f0Hz[i] })).filter((f) => f.ms > fromMs && f.ms < toMs);

describe("trackPitch", () => {
  it("finds a steady pitch in nearly every voiced frame", () => {
    const track = trackPitch(voicedTone(() => 120, 2), FS);
    const frames = inside(track, 600, 2400);
    const found = frames.filter((f) => f.f0 > 0);
    expect(found.length / frames.length).toBeGreaterThan(0.95);
    for (const f of found) expect(Math.abs(f.f0 - 120)).toBeLessThan(1.5);
  });

  it("leaves the silence unvoiced", () => {
    const track = trackPitch(voicedTone(() => 120, 2), FS);
    expect(inside(track, 0, 400).every((f) => f.f0 === 0)).toBe(true);
  });

  it.each([
    ["a bass voice", 70],
    ["a low voice", 95],
    ["a high voice", 260],
    ["a very high voice", 420],
  ])("tracks %s (%i Hz) within 2%%", (_, hz) => {
    const track = trackPitch(voicedTone(() => hz, 2), FS);
    const found = inside(track, 600, 2400).filter((f) => f.f0 > 0);
    expect(found.length).toBeGreaterThan(150);
    const median = found.map((f) => f.f0).sort((a, b) => a - b)[Math.floor(found.length / 2)];
    expect(Math.abs(median - hz) / hz).toBeLessThan(0.02);
  });

  it("reports range in semitones, so a low and a high voice moving the same musical amount match", () => {
    const glide = (base: number) => (t: number) => base * 2 ** ((4 * Math.sin(2 * Math.PI * 0.5 * t)) / 12);
    const ranges = [80, 110, 220, 330].map((base) => summarizePitch(trackPitch(voicedTone(glide(base), 4), FS)).rangeSemitones as number);
    for (const r of ranges) {
      // p10-p90 of a 4-semitone sine is about 7.6 semitones.
      expect(r).toBeGreaterThan(6.8);
      expect(r).toBeLessThan(8.4);
    }
    expect(Math.max(...ranges) - Math.min(...ranges)).toBeLessThan(0.6);
  });

  it("tells a monotone take from a lively one", () => {
    const flat = summarizePitch(trackPitch(voicedTone((t) => 110 * 2 ** ((0.5 * Math.sin(2 * Math.PI * t)) / 12), 4), FS));
    const lively = summarizePitch(trackPitch(voicedTone((t) => 110 * 2 ** ((5 * Math.sin(2 * Math.PI * t)) / 12), 4), FS));
    expect(lively.sdSemitones as number).toBeGreaterThan((flat.sdSemitones as number) * 4);
  });

  it("does not report hiss as pitch", () => {
    const n = 2 * FS;
    const hiss = new Float32Array(n);
    for (let i = 0; i < n; i++) hiss[i] = 0.3 * Math.sin((2 * Math.PI * 6400 * i) / FS);
    const track = trackPitch(hiss, FS);
    const voiced = Array.from(track.f0Hz).filter((v) => v > 0);
    expect(voiced.every((v) => v >= 60 && v <= 600)).toBe(true);
    expect(summarizePitch(track).medianHz).toBeNull();
  });

  it("finds most of the voice in syllable-like speech, where the old tracker found under a fifth", () => {
    const { wave } = synthSpeech({ baseHz: 110, accentSt: 3 });
    const track = trackPitch(wave, FS);
    const s = summarizePitch(track);
    // About 5.2 s of the take is voiced syllables.
    expect((s.voicedFrames * track.hopMs) / 1000).toBeGreaterThan(4.2);
    expect(s.medianHz as number).toBeGreaterThan(100);
    expect(s.medianHz as number).toBeLessThan(121);
  });

  it("orders synthetic monotone, normal and lively speakers by range, at any voice height", () => {
    for (const baseHz of [95, 210]) {
      const range = (accentSt: number) => summarizePitch(trackPitch(synthSpeech({ baseHz, accentSt, seed: 3 }).wave, FS)).rangeSemitones as number;
      const mono = range(0.7);
      const normal = range(3);
      const lively = range(5);
      expect(mono).toBeLessThan(2);
      expect(normal).toBeGreaterThan(mono + 2);
      expect(lively).toBeGreaterThan(normal + 1.5);
    }
  });
});
