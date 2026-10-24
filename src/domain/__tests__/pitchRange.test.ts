import { FIXED_PITCH_BAND, pitchRangeBand, pitchScore as pitchRangeScore, PITCH_FLAT_ST } from "../scoring/bands";
import { summarizePitch, trackPitch } from "../dsp/pitchTracker";
import { FS, synthSpeech } from "./synthSpeech";

describe("pitchRangeScore", () => {
  it("scores the fixed band: 1 st nothing, 5 st full marks", () => {
    expect(pitchRangeScore(0.5)).toBe(0);
    expect(pitchRangeScore(1)).toBe(0);
    expect(pitchRangeScore(3)).toBe(5);
    expect(pitchRangeScore(5)).toBe(10);
    expect(pitchRangeScore(9)).toBe(10);
  });

  it("gives a low and a high voice the same score for the same musical movement", () => {
    const score = (baseHz: number) => pitchRangeScore(summarizePitch(trackPitch(synthSpeech({ baseHz, accentSt: 3, seed: 5 }).wave, FS)).rangeSemitones as number);
    expect(Math.abs(score(90) - score(220))).toBeLessThan(1);
  });

  it("puts a monotone voice under the flat line and a lively one near full marks", () => {
    const range = (accentSt: number) => summarizePitch(trackPitch(synthSpeech({ baseHz: 115, accentSt, seed: 9 }).wave, FS)).rangeSemitones as number;
    expect(range(0.7)).toBeLessThan(PITCH_FLAT_ST);
    expect(pitchRangeScore(range(5))).toBeGreaterThanOrEqual(9);
  });
});

describe("pitchRangeBand", () => {
  it("stays fixed under 5 earlier takes", () => {
    expect(pitchRangeBand([])).toBe(FIXED_PITCH_BAND);
    expect(pitchRangeBand([3, 3, 3, 3])).toBe(FIXED_PITCH_BAND);
  });

  it("becomes personal from 5 takes: a little over your usual range", () => {
    const band = pitchRangeBand([4.6, 5, 4.8, 5.2, 5.4]);
    expect(band.source).toBe("personal");
    expect(band.usualSt).toBe(5);
    expect(band.fullSt).toBe(5.5);
    expect(band.takes).toBe(5);
  });

  it("never sets the bar at a flat habit, nor asks a lively speaker for theatre", () => {
    expect(pitchRangeBand([2, 2.2, 2.1, 1.9, 2.4]).fullSt).toBe(4);
    expect(pitchRangeBand([7, 8, 7.5, 7.2, 7.8]).fullSt).toBe(6);
  });

  it("uses the most recent 20 takes and ignores missing ones", () => {
    const recent = Array(20).fill(5);
    const old = Array(30).fill(2);
    expect(pitchRangeBand([...recent, ...old]).usualSt).toBe(5);
    expect(pitchRangeBand([NaN, 0, 5, 5, 5, 5, 5]).takes).toBe(5);
  });

  it("scores against the personal band", () => {
    const band = pitchRangeBand([2, 2.2, 2.1, 1.9, 2.4]);
    expect(pitchRangeScore(4, band)).toBe(10);
    expect(pitchRangeScore(4, FIXED_PITCH_BAND)).toBe(7.5);
  });
});
