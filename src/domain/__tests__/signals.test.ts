import { extractAudioFeatures } from "../dsp/audioFeatures";
import { pausesFromFeatures } from "../dsp/pauses";
import { computePresenceMetrics, countNods, type PresenceSample } from "../presenceMetrics";
import { countSyllables, packAudioFeatures, prosodyStatsOf, rateStatsOf, speakingWpm, unpackAudioTrack } from "../signals/audioSummary";
import { packFaceTrack, timelineColumns, unpackFaceTrack } from "../signals/faceTrack";
import { base64ToBytes, bytesToBase64, centsToHz, hzToCents, packInt16, packUint32, unpackInt16, unpackUint32, UNVOICED_CENTS } from "../signals/pack";
import { BLENDSHAPE_NAMES } from "../faceSignals";
import type { TranscriptWord } from "../sessionTypes";
import { FS, synthSpeech } from "./synthSpeech";

describe("packing", () => {
  it("round-trips base64 of every length", () => {
    for (let n = 0; n < 9; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 97 + 13) & 255);
      expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
    }
    expect(bytesToBase64(Uint8Array.from([77, 97, 110]))).toBe("TWFu");
  });

  it("round-trips signed and unsigned arrays", () => {
    expect(Array.from(unpackInt16(packInt16([-32768, -1, 0, 1, 32767, 40000])))).toEqual([-32768, -1, 0, 1, 32767, 32767]);
    expect(Array.from(unpackUint32(packUint32([0, 1, 70000, 4000000000])))).toEqual([0, 1, 70000, 4000000000]);
  });

  it("keeps pitch to a cent and marks unvoiced frames", () => {
    expect(hzToCents(0)).toBe(UNVOICED_CENTS);
    expect(centsToHz(UNVOICED_CENTS)).toBe(0);
    for (const hz of [62, 110, 237.5, 590]) expect(Math.abs(1200 * Math.log2(centsToHz(hzToCents(hz)) / hz))).toBeLessThanOrEqual(0.5);
  });

  it("round-trips a take's audio track", () => {
    const f = extractAudioFeatures(synthSpeech({ phrases: 3 }).wave, FS);
    const track = packAudioFeatures(f, { thread: "js", elapsedMs: 12 });
    const back = unpackAudioTrack(JSON.parse(JSON.stringify(track)), f.durationMs);
    expect(back.f0Hz.length).toBe(f.f0Hz.length);
    expect(Array.from(back.speech)).toEqual(Array.from(f.speech));
    expect(Array.from(back.peaks)).toEqual(Array.from(f.peaks));
    for (let i = 0; i < f.f0Hz.length; i += 7) {
      if (f.f0Hz[i] > 0) expect(Math.abs(back.f0Hz[i] - f.f0Hz[i]) / f.f0Hz[i]).toBeLessThan(0.001);
      else expect(back.f0Hz[i]).toBe(0);
      expect(Math.abs(back.levelDb[i] - f.levelDb[i])).toBeLessThan(0.01);
    }
    // Pauses recomputed from the stored track match.
    expect(pausesFromFeatures(back).pauses.length).toBe(pausesFromFeatures(f).pauses.length);
  });
});

function face(tMs: number, over: Partial<PresenceSample> = {}): PresenceSample {
  const bs = BLENDSHAPE_NAMES.map((n) => (n === "mouthSmileLeft" || n === "mouthSmileRight" ? 0.4 : n === "jawOpen" ? 0.3 : 0));
  return { tMs, present: true, yaw: 2.5, pitch: -1.2, roll: 0.4, smile: 0.4, eyesOpen: 1, framed: true, gazeX: 0.05, gazeY: -0.1, browRaise: 0, jawOpen: 0.3, blinks: 0, bs, ...over };
}

describe("face track", () => {
  it("round-trips pose, gaze, blinks and the expression the blendshapes carry", () => {
    const timeline = [face(0), face(60, { blinks: 1 }), { tMs: 120, present: false, yaw: 0, pitch: 0, smile: 0, eyesOpen: 0, framed: false, blinks: 0 }];
    const back = unpackFaceTrack(JSON.parse(JSON.stringify(packFaceTrack(timeline))));
    expect(back).toHaveLength(3);
    expect(back[0].yaw).toBeCloseTo(2.5, 1);
    expect(back[0].pitch).toBeCloseTo(-1.2, 1);
    expect(back[0].gazeY).toBeCloseTo(-0.1, 3);
    expect(back[0].smile).toBeCloseTo(0.4, 2);
    expect(back[0].jawOpen).toBeCloseTo(0.3, 2);
    expect(back[1].blinks).toBe(1);
    expect(back[2].present).toBe(false);
    expect(back[1].tMs).toBe(60);
  });

  it("notes the detection rate", () => {
    const timeline = Array.from({ length: 41 }, (_, i) => face(i * 50));
    expect(packFaceTrack(timeline).rateHz).toBe(20);
    expect(timelineColumns(timeline).tMs).toHaveLength(41);
  });
});

describe("presence additions", () => {
  it("counts looking up apart from looking down, and off the lens", () => {
    const timeline = [...Array.from({ length: 80 }, (_, i) => face(i * 50)), ...Array.from({ length: 20 }, (_, i) => face(4000 + i * 50, { gazeY: 0.4 }))];
    const m = computePresenceMetrics(timeline)!;
    expect(m.lookingUpPercent).toBe(20);
    expect(m.lookingDownPercent).toBe(0);
    expect(m.eyeContactPercent).toBe(80);
  });

  it("leaves the jaw out of expressiveness: talking with a still face reads flat", () => {
    const talking = Array.from({ length: 200 }, (_, i) => face(i * 50, { jawOpen: i % 4 < 2 ? 0.05 : 0.6 }));
    expect(computePresenceMetrics(talking)!.expressiveness).toBe(0);
    const animated = Array.from({ length: 200 }, (_, i) => face(i * 50, { smile: i % 40 < 20 ? 0.1 : 0.5, browRaise: i % 30 < 15 ? 0 : 0.4, cheekSquint: i % 40 < 20 ? 0 : 0.3 }));
    expect(computePresenceMetrics(animated)!.expressiveness).toBeGreaterThan(60);
  });

  it("counts nods either way, but not a held turn", () => {
    const nod = (t0: number, dir: number) => [0, 100, 200, 300, 400, 500].map((d, k) => face(t0 + d, { pitch: dir * [0, 3, 6, 6, 1, 0][k] }));
    const still = (t0: number, n: number) => Array.from({ length: n }, (_, i) => face(t0 + i * 100, { pitch: 0 }));
    const timeline = [...still(0, 20), ...nod(2000, 1), ...still(2600, 20), ...nod(4600, -1), ...still(5200, 20)];
    expect(countNods(timeline)).toBe(2);
    const held = [...still(0, 20), ...Array.from({ length: 30 }, (_, i) => face(2000 + i * 100, { pitch: 8 }))];
    expect(countNods(held)).toBe(0);
  });
});

function wordsAt(spec: [string, number, number][]): TranscriptWord[] {
  return spec.map(([text, startMs, endMs]) => ({ text, startMs, endMs }));
}

describe("rate", () => {
  it("counts syllables well enough for a rate", () => {
    expect(countSyllables("the")).toBe(1);
    expect(countSyllables("speaking")).toBe(2);
    expect(countSyllables("presentation")).toBe(4);
    expect(countSyllables("make")).toBe(1);
    expect(countSyllables("table")).toBe(2);
    expect(countSyllables("2024")).toBe(4);
  });

  it("measures pace over the speaking span, not the silence around it", () => {
    // 20 words between 5 s and 15 s of a 30 s take: 120 a minute, not 40.
    const words = wordsAt(Array.from({ length: 20 }, (_, i) => ["word", 5000 + i * 500, 5000 + i * 500 + 400] as [string, number, number]));
    expect(speakingWpm(words)).toBe(Math.round(20 / ((14900 - 5000) / 60000)));
  });

  it("takes pauses out for the articulation rate and sees a speed-up", () => {
    const words: TranscriptWord[] = [];
    let t = 0;
    for (let i = 0; i < 12; i++) words.push({ text: "hello", startMs: (t += 100), endMs: (t += 500) }); // 4 syl/s
    for (let i = 0; i < 12; i++) words.push({ text: "hello", startMs: (t += 50), endMs: (t += 300) }); // faster
    const rate = rateStatsOf(words, null)!;
    expect(rate.articulationSylPerSec).toBeGreaterThan(3);
    expect(rate.paceDriftPercent).toBeGreaterThan(30);
  });
});

describe("prosody", () => {
  it("hears uptalk on statements that rise at the end", () => {
    const rising = synthSpeech({ phrases: 4, syllables: 5, accentSt: 0.5, finalRiseSt: 5, seed: 2 });
    const flat = synthSpeech({ phrases: 4, syllables: 5, accentSt: 0.5, seed: 2 });
    const asWords = (spans: [number, number][]) =>
      spans.flatMap(([a, b]) => {
        const n = 5;
        const step = (b - a) / n;
        return Array.from({ length: n }, (_, k) => ({ text: k === n - 1 ? "end." : "word", startMs: a + k * step, endMs: a + (k + 1) * step - 50 + (k === n - 1 ? 50 : 0) }));
      });
    const up = prosodyStatsOf(extractAudioFeatures(rising.wave, FS), asWords(rising.truth.phraseSpans)).uptalk!;
    const down = prosodyStatsOf(extractAudioFeatures(flat.wave, FS), asWords(flat.truth.phraseSpans)).uptalk!;
    expect(up.statements).toBeGreaterThanOrEqual(3);
    expect(up.rising).toBeGreaterThanOrEqual(3);
    expect(down.rising).toBe(0);
  });

  it("hears trailing off when the last word drops away", () => {
    const fading = synthSpeech({ phrases: 4, syllables: 6, accentDb: 1, finalDropDb: 12, seed: 3 });
    const words = fading.truth.phraseSpans.flatMap(([a, b]) => {
      const step = (b - a) / 6;
      return Array.from({ length: 6 }, (_, k) => ({ text: k === 5 ? "done." : "word", startMs: a + k * step, endMs: a + (k + 1) * step - 50 }));
    });
    const t = prosodyStatsOf(extractAudioFeatures(fading.wave, FS), words).trailingOff!;
    expect(t.sentences).toBe(4);
    expect(t.trailing).toBeGreaterThanOrEqual(3);
  });
});
