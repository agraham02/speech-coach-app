import { extractAudioFeatures, SPEECH } from "../dsp/audioFeatures";
import { FLOOR, settleFarRuns } from "../dsp/pitchTracker";

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

describe("a voice going high", () => {
  it("is followed all the way up, not folded back an octave", () => {
    const f = extractAudioFeatures(glide(10, 100, 420), RATE);
    const hz = Array.from(f.f0Hz).filter((v) => v > 0);
    expect(Math.max(...hz)).toBeGreaterThan(380);
    let jump = 0;
    for (let i = 1; i < f.f0Hz.length; i++) if (f.f0Hz[i] > 0 && f.f0Hz[i - 1] > 0) jump = Math.max(jump, Math.abs(12 * Math.log2(f.f0Hz[i] / f.f0Hz[i - 1])));
    expect(jump).toBeLessThan(6);
  });
});

describe("settleFarRuns", () => {
  const run = (hz: number, frames: number) => new Array<number>(frames).fill(hz);
  const track = (...parts: number[][]) => Float64Array.from(parts.flat());

  it("drops a short run a long way out, like an s the tracker found a period in", () => {
    const out = settleFarRuns(track(run(100, 50), [0], run(320, 15), [0], run(100, 50)), 100, 60, 600);
    expect(out.slice(51, 66).every((v) => v === 0)).toBe(true);
    expect(out[0]).toBe(100);
  });

  it("folds a short run that lands near the median, an octave error", () => {
    const out = settleFarRuns(track(run(100, 50), [0], run(210, 15), [0], run(100, 50)), 100, 60, 600);
    expect(out[55]).toBeCloseTo(105, 5);
  });

  it("leaves a long run alone: the voice really went there", () => {
    const out = settleFarRuns(track(run(100, 50), [0], run(320, 60), [0], run(100, 50)), 100, 60, 600);
    expect(out[60]).toBe(320);
  });

  it("leaves a run alone when it reaches the normal range", () => {
    const climb = Array.from({ length: 200 }, (_, i) => 100 * 2 ** (i / 80));
    const out = settleFarRuns(Float64Array.from(climb), 100, 60, 600);
    expect(out[199]).toBeCloseTo(climb[199], 5);
  });
});
