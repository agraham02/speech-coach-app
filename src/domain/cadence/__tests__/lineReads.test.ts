import { linePauseTargets, scoreLineReads } from "../lineReads";
import type { MarkedText } from "../marks";

const line: MarkedText = {
  text: "We didn't fail because the plan was wrong.",
  marks: [
    { kind: "emphasis", word: 2 },
    { kind: "pause", afterWord: 2 },
    { kind: "long_pause", afterWord: 7 }, // after the last word: can't be judged
  ],
};

// Whisper-style words, 300 ms each, with an optional gap after word `gapAfter`.
function timed(text: string, gapAfter: number | null, gapMs: number) {
  let t = 0;
  return text.split(" ").map((w, i) => {
    const word = { text: w, startMs: t, endMs: t + 300 };
    t += 300 + (i === gapAfter ? gapMs : 20);
    return word;
  });
}

describe("line reads", () => {
  it("finds the target word each pause mark follows, hyphens split like the target", () => {
    expect(linePauseTargets(line)).toEqual([2]);
    expect(linePauseTargets({ text: "A well-known line / ends here", marks: [{ kind: "pause", afterWord: 2 }] })).toEqual([3]);
  });

  it("a clean read is near 100, and the marks share the headline", () => {
    const s = scoreLineReads([{ line, reads: [{ text: line.text, words: null }] }], { shared: 1, coach: 2 });
    expect(s.accuracyPercent).toBe(100);
    expect(s.score).toBe(0.75);
    expect(s.leafScores.read_accuracy?.score).toBe(1);
    expect(s.leafScores.where_to_stress?.score).toBe(0.5);
  });

  it("averages the reads", () => {
    const s = scoreLineReads([{ line, reads: [{ text: line.text, words: null }, { text: "we didn't fail", words: null }] }], null);
    expect(s.accuracyPercent).toBeGreaterThan(55);
    expect(s.accuracyPercent).toBeLessThan(75);
  });

  it("reading something else fails the gate and moves nothing", () => {
    const s = scoreLineReads([{ line, reads: [{ text: "the weather is nice today", words: null }] }], { shared: 2, coach: 2 });
    expect(s.score).toBeNull();
    expect(s.gate).toMatchObject({ passed: false, kind: "failed" });
    expect(s.leafScores).toEqual({});
  });

  it("no recording is not checked, never a self-rating", () => {
    const s = scoreLineReads([{ line, reads: [] }], { shared: 1, coach: 2 });
    expect(s.score).toBeNull();
    expect(s.gate).toMatchObject({ passed: false, kind: "not_checked" });
  });

  it("a pause held at the mark is found from Whisper's times, and kept apart from the headline", () => {
    const held = scoreLineReads([{ line, reads: [{ text: line.text, words: timed(line.text, 2, 400) }] }], null);
    expect(held.leafScores.deliberate_pauses?.score).toBe(1);
    expect(held.score).toBe(1);
    const rushed = scoreLineReads([{ line, reads: [{ text: line.text, words: timed(line.text, null, 0) }] }], null);
    expect(rushed.leafScores.deliberate_pauses?.score).toBe(0);
    expect(rushed.score).toBe(1);
  });

  it("is a little easier when English isn't your first language", () => {
    // 5 of the 8 words is 62%: under the 70% bar, over the relaxed 60%.
    const read = { text: "we didn't fail because the", words: null };
    expect(scoreLineReads([{ line, reads: [read] }], null).gate.passed).toBe(false);
    expect(scoreLineReads([{ line, reads: [read] }], null, { relaxed: true }).gate.passed).toBe(true);
  });
});
