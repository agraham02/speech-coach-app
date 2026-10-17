jest.mock("react-native-audio-api", () => ({ decodeAudioData: jest.fn() }));
jest.mock("../../utils/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { analyzePitchVolume, MAX_SPEECH_PITCH_HZ, MIN_SPEECH_PITCH_HZ } from "../audioAnalysis";

const SAMPLE_RATE = 16000;

function tone(hz: number, seconds: number, amplitude = 0.3): Float32Array {
  const out = new Float32Array(Math.round(SAMPLE_RATE * seconds));
  for (let i = 0; i < out.length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE);
  return out;
}

describe("analyzePitchVolume pitch range", () => {
  it("finds the pitch of a voice-range tone", () => {
    const result = analyzePitchVolume(tone(200, 2), SAMPLE_RATE);
    expect(result.status).toBe("complete");
    expect(result.pitchAvgHz).toBeGreaterThan(190);
    expect(result.pitchAvgHz).toBeLessThan(210);
    expect(result.pitchMaxHz! - result.pitchMinHz!).toBeLessThan(30);
  });

  it("ignores a high-frequency hiss-like tone instead of reporting it as pitch", () => {
    const result = analyzePitchVolume(tone(6400, 2), SAMPLE_RATE);
    expect(result.pitchMaxHz).toBeNull();
    expect(result.pitchContourHz.every((p) => p === null)).toBe(true);
  });

  it("does not let a burst of noise stretch the range of a real voice", () => {
    const voice = tone(180, 3);
    const hiss = tone(6500, 0.4);
    const mixed = new Float32Array(voice.length);
    mixed.set(voice);
    mixed.set(hiss, SAMPLE_RATE * 1);
    const result = analyzePitchVolume(mixed, SAMPLE_RATE);
    expect(result.pitchMaxHz).toBeLessThanOrEqual(MAX_SPEECH_PITCH_HZ);
    expect(result.pitchMinHz).toBeGreaterThanOrEqual(MIN_SPEECH_PITCH_HZ);
  });
});
