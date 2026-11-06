import { SPEECH } from "../audioFeatures";
import { alignWordsToSpeech } from "../wordAlign";

const HOP = 10;
// A speech track from [startMs, endMs] runs of voice.
function track(durationMs: number, runs: [number, number][]) {
  const speech = new Uint8Array(durationMs / HOP);
  for (const [a, b] of runs) for (let i = a / HOP; i < b / HOP; i++) speech[i] = SPEECH;
  return { speech, hopMs: HOP, offsetMs: HOP / 2 };
}
const word = (text: string, startMs: number, endMs: number) => ({ text, startMs, endMs });

describe("alignWordsToSpeech", () => {
  it("moves the first word to where the voice starts and keeps the proportions", () => {
    const words = [word("a", 0, 1000), word("b", 1000, 2000), word("c", 2000, 4000)];
    const out = alignWordsToSpeech(words, track(5000, [[2000, 4000]]))!;
    expect(out[0].startMs).toBe(2000);
    expect(out[0].endMs).toBe(2500);
    expect(out[1].endMs).toBe(3000);
    expect(out[2].endMs).toBe(4000);
  });

  it("takes the lead-in out of the speaking span", () => {
    const words = Array.from({ length: 20 }, (_, i) => word("w", i * 500, (i + 1) * 500));
    const out = alignWordsToSpeech(words, track(11000, [[3000, 10000]]))!;
    expect(out[out.length - 1].endMs - out[0].startMs).toBe(7000);
  });

  it("pins a pause to the nearest word boundary", () => {
    const words = [word("a", 0, 500), word("b", 500, 1000), word("c", 1000, 1500), word("d", 1500, 2000)];
    const out = alignWordsToSpeech(words, track(2500, [[0, 900], [1300, 2000]]))!;
    expect(out[1].endMs).toBe(900);
    expect(out[2].startMs).toBe(1300);
  });

  it("leaves a pause alone when no boundary is near it", () => {
    const words = [word("a", 0, 3000), word("b", 3000, 6000)];
    const out = alignWordsToSpeech(words, track(6000, [[0, 1000], [1500, 6000]]))!;
    expect(out[0].endMs).toBe(3000);
  });

  it("never reaches past where Whisper had the words", () => {
    const words = [word("a", 1000, 1500), word("b", 1500, 2000)];
    const out = alignWordsToSpeech(words, track(4000, [[500, 3500]]))!;
    expect(out[0].startMs).toBe(1000);
    expect(out[1].endMs).toBe(2000);
  });

  it("ignores a click before the voice", () => {
    const words = [word("a", 0, 500), word("b", 500, 1000)];
    const out = alignWordsToSpeech(words, track(2000, [[50, 100], [1000, 2000]]))!;
    expect(out[0].startMs).toBeGreaterThanOrEqual(0);
    expect(out[1].endMs).toBe(1000);
  });

  it("hands back what it can't improve", () => {
    const words = [word("a", 0, 500)];
    expect(alignWordsToSpeech(null, track(1000, []))).toBeNull();
    expect(alignWordsToSpeech(words, track(1000, []))).toBe(words);
    expect(alignWordsToSpeech(words, track(2000, [[1000, 2000]]))).toBe(words);
  });

  it("keeps words in order and doesn't change the input", () => {
    const words = [word("a", 0, 400), word("b", 400, 800), word("c", 800, 1200), word("d", 1200, 1600)];
    const copy = JSON.parse(JSON.stringify(words));
    const out = alignWordsToSpeech(words, track(2000, [[300, 700], [1100, 1600]]))!;
    expect(words).toEqual(copy);
    for (let i = 1; i < out.length; i++) expect(out[i].startMs).toBeGreaterThanOrEqual(out[i - 1].endMs);
  });
});
