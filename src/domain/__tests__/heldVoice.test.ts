import { extractAudioFeatures, SPEECH } from "../dsp/audioFeatures";
import { FLOOR } from "../dsp/pitchTracker";

const RATE = 16000;

// A voice with harmonics sliding from loHz to hiHz, at one level, with no gap.
function glide(seconds: number, loHz: number, hiHz: number, amp = 0.1): Float32Array {
  const n = seconds * RATE;
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const hz = loHz * Math.pow(hiHz / loHz, i / n);
    phase += (2 * Math.PI * hz) / RATE;
    out[i] = amp * (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase));
  }
  return out;
}

function noise(seconds: number, amp: number): Float32Array {
  const out = new Float32Array(seconds * RATE);
  let seed = 7;
  for (let i = 0; i < out.length; i++) {
    seed = (seed * 16807) % 2147483647;
    out[i] = amp * (seed / 1073741823.5 - 1);
  }
  return out;
}

const voicedSeconds = (f0: Float32Array, hopMs: number) => (f0.reduce((a, v) => a + (v > 0 ? 1 : 0), 0) * hopMs) / 1000;
const speechShare = (speech: Uint8Array) => speech.reduce((a, v) => a + (v === SPEECH ? 1 : 0), 0) / speech.length;

describe("one long held sound", () => {
  it("is heard the whole way through", () => {
    const f = extractAudioFeatures(glide(10, 90, 220), RATE);
    expect(voicedSeconds(f.f0Hz, f.hopMs)).toBeGreaterThan(8);
    expect(speechShare(f.speech)).toBeGreaterThan(0.8);
  });

  it("was all but lost when the floor came from the sound itself", () => {
    const saved = FLOOR.narrowBandDb;
    FLOOR.narrowBandDb = 0;
    try {
      const f = extractAudioFeatures(glide(10, 90, 220), RATE);
      expect(voicedSeconds(f.f0Hz, f.hopMs)).toBeLessThan(1);
    } finally {
      FLOOR.narrowBandDb = saved;
    }
  });

  it("leaves a room with nothing in it as silence", () => {
    const f = extractAudioFeatures(noise(5, 0.01), RATE);
    expect(voicedSeconds(f.f0Hz, f.hopMs)).toBeLessThan(0.5);
    expect(speechShare(f.speech)).toBeLessThan(0.2);
  });

  it("keeps the floor of a take that has real quiet in it", () => {
    const quiet = noise(2, 0.0005);
    const voice = glide(2, 100, 140);
    const take = new Float32Array(quiet.length * 2 + voice.length);
    take.set(quiet, 0);
    take.set(voice, quiet.length);
    take.set(quiet, quiet.length + voice.length);
    const f = extractAudioFeatures(take, RATE);
    expect(f.noiseFloorDb).toBeLessThan(-60);
    expect(voicedSeconds(f.f0Hz, f.hopMs)).toBeGreaterThan(1.5);
  });
});
