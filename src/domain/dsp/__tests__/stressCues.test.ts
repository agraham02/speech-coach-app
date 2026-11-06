import { scoreSyllablePeaks, strongestWord } from "../stressCues";
import { buildFeatures, buildReading, stressedSentence } from "../../signalLab/__tests__/syntheticFeatures";

const SENTENCE = ["I", "didn't", "say", "she", "stole", "the", "money"];

describe("scoreSyllablePeaks", () => {
  it("finds the stressed word when pitch, loudness and length all mark it", () => {
    for (let k = 0; k < SENTENCE.length; k++) {
      const r = stressedSentence(SENTENCE, [k]);
      const scored = scoreSyllablePeaks(r.features, r.words);
      expect(scored.peaks).toHaveLength(7);
      expect(strongestWord(scored)).toBe(k);
    }
  });

  it("finds it from pitch and length alone, where loudness has nothing to say", () => {
    for (const k of [1, 4, 6]) {
      const r = stressedSentence(SENTENCE, [k], { pitchSt: 3, loudDb: 0, lengthMult: 1.6 });
      expect(strongestWord(scoreSyllablePeaks(r.features, r.words))).toBe(k);
    }
  });

  it("scores each peak on three z-scored cues", () => {
    const r = stressedSentence(SENTENCE, [4]);
    const peak = scoreSyllablePeaks(r.features, r.words).peaks[4];
    expect(peak.pitchSt).toBeGreaterThan(2);
    expect(peak.loudDb).toBeGreaterThan(3);
    expect(peak.lengthMs).toBeGreaterThanOrEqual(340);
    expect(peak.zPitch).toBeGreaterThan(1);
    expect(peak.zLoud).toBeGreaterThan(1);
    expect(peak.zLength).toBeGreaterThan(1);
    expect(peak.score).toBeGreaterThan(1.5);
    expect(peak.strong).toBe(true);
    expect(peak.wordIndex).toBe(4);
  });

  const passage = Array.from({ length: 40 }, (_, k) => (k % 2 ? "money" : "the"));
  it("stands out more when key words are stressed than when the read is flat", () => {
    const flat = stressedSentence(passage, []);
    const stressed = stressedSentence(passage, [3, 12, 21, 28, 35]);
    const a = scoreSyllablePeaks(flat.features, flat.words);
    const b = scoreSyllablePeaks(stressed.features, stressed.words);
    expect(a.standOut).not.toBeNull();
    expect(b.standOut! - a.standOut!).toBeGreaterThanOrEqual(0.5);
  });

  it("sees a take reaching further, which a take's own z scores can't", () => {
    const small = stressedSentence(passage, [3, 12, 21, 28, 35], { loudDb: 2, pitchSt: 1 });
    const large = stressedSentence(passage, [3, 12, 21, 28, 35], { loudDb: 8, pitchSt: 4 });
    const a = scoreSyllablePeaks(small.features, small.words);
    const b = scoreSyllablePeaks(large.features, large.words);
    expect(b.standOut!).toBeGreaterThan(a.standOut! + 0.5);
    expect(b.standOutCues.loudDb!).toBeGreaterThan(a.standOutCues.loudDb!);
    expect(b.standOutCues.pitchSt!).toBeGreaterThan(a.standOutCues.pitchSt!);
  });

  it("reports how many strong peaks land on content words", () => {
    const alt = Array.from({ length: 20 }, (_, k) => (k % 2 ? "money" : "the"));
    const onContent = stressedSentence(alt, [1, 5, 9, 13]);
    expect(scoreSyllablePeaks(onContent.features, onContent.words).contentShare).toBe(1);
    const onStop = stressedSentence(alt, [0, 4, 8, 12]);
    expect(scoreSyllablePeaks(onStop.features, onStop.words).contentShare).toBe(0);
  });

  it("gives no content share without words, and none from too few peaks on words", () => {
    const r = stressedSentence(passage, [3, 12]);
    expect(scoreSyllablePeaks(r.features).contentShare).toBeNull();
    expect(scoreSyllablePeaks(r.features).peaks[0].wordIndex).toBeNull();
    expect(scoreSyllablePeaks(r.features, []).contentShare).toBeNull();
  });

  it("is null-safe on thin takes", () => {
    const quiet = buildFeatures([{ ms: 2000, kind: "pause" }]);
    expect(scoreSyllablePeaks(quiet)).toMatchObject({ peaks: [], standOut: null, strongPeaks: 0, contentShare: null });
    const few = buildReading([
      { text: "a", hz: 120 },
      { text: "b", hz: 130, db: 70 },
      { text: "c", hz: 120 },
    ]);
    const r = scoreSyllablePeaks(few.features, few.words);
    expect(r.peaks).toHaveLength(3);
    expect(r.standOut).toBeNull();
    expect(strongestWord(r)).toBe(1);
    expect(strongestWord(scoreSyllablePeaks(quiet))).toBeNull();
  });

  it("scores zero on a cue it cannot read instead of failing", () => {
    // Unvoiced speech with loudness peaks: no pitch, no voiced run.
    const levels = (t: number) => 55 + 8 * Math.sin((2 * Math.PI * t) / 250);
    const f = buildFeatures([{ ms: 200, kind: "pause" }, { ms: 3000, levelDb: levels }, { ms: 200, kind: "pause" }]);
    const r = scoreSyllablePeaks(f);
    expect(r.peaks.length).toBeGreaterThan(5);
    for (const p of r.peaks) {
      expect(p.pitchSt).toBeNull();
      expect(p.zPitch).toBe(0);
      expect(p.lengthMs).toBeNull();
      expect(Number.isFinite(p.score)).toBe(true);
    }
  });
});
