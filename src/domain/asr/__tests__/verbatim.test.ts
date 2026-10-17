import { wordsFromSegments } from "../verbatim";

const APOS = String.fromCharCode(39);

describe("wordsFromSegments", () => {
  it("builds words and converts 10 ms ticks to milliseconds", () => {
    const words = wordsFromSegments([
      { text: " So", t0: 0, t1: 20 },
      { text: " um", t0: 25, t1: 40 },
      { text: " yeah", t0: 50, t1: 80 },
    ]);
    expect(words).toEqual([
      { text: "So", startMs: 0, endMs: 200 },
      { text: "um", startMs: 250, endMs: 400 },
      { text: "yeah", startMs: 500, endMs: 800 },
    ]);
  });

  it("joins sub-word pieces and punctuation onto the word before", () => {
    const words = wordsFromSegments([
      { text: " I", t0: 0, t1: 10 },
      { text: APOS + "m", t0: 10, t1: 18 },
      { text: " sure", t0: 20, t1: 40 },
      { text: ",", t0: 40, t1: 42 },
      { text: " ok", t0: 50, t1: 60 },
    ]);
    expect(words.map((w) => w.text)).toEqual(["I" + APOS + "m", "sure,", "ok"]);
    expect(words[0].endMs).toBe(180);
    expect(words[1].endMs).toBe(420);
  });

  it("starts a word on the first piece even without a leading space", () => {
    expect(wordsFromSegments([{ text: "Hello", t0: 0, t1: 30 }]).map((w) => w.text)).toEqual(["Hello"]);
  });

  it("skips empty pieces and special tokens", () => {
    const words = wordsFromSegments([
      { text: "[_BEG_]", t0: 0, t1: 0 },
      { text: "  ", t0: 0, t1: 5 },
      { text: " hi", t0: 5, t1: 20 },
      { text: "[_TT_150]", t0: 20, t1: 20 },
    ]);
    expect(words).toEqual([{ text: "hi", startMs: 50, endMs: 200 }]);
  });

  it("is empty for no segments", () => {
    expect(wordsFromSegments([])).toEqual([]);
  });
});
