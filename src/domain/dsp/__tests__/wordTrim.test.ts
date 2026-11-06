import { SPEECH } from "../audioFeatures";
import { trimWordsToVoice } from "../wordTrim";

const HOP = 10;
// A speech track from [startMs, endMs] runs of voice.
function track(durationMs: number, runs: [number, number][]) {
  const speech = new Uint8Array(durationMs / HOP);
  for (const [a, b] of runs) for (let i = a / HOP; i < b / HOP; i++) speech[i] = SPEECH;
  return { speech, hopMs: HOP, offsetMs: 0 };
}
const word = (text: string, startMs: number, endMs: number) => ({ text, startMs, endMs });

describe("trimWordsToVoice", () => {
  it("starts the first word when the voice starts", () => {
    const out = trimWordsToVoice([word("a", 50, 2000), word("b", 2000, 3000)], track(4000, [[1600, 3000]]))!;
    expect(out[0].startMs).toBe(1600);
    expect(out[0].endMs).toBe(2000);
    expect(out[1]).toMatchObject({ startMs: 2000, endMs: 2990 });
  });

  it("takes the lead-in out of the speaking span, and only that", () => {
    const words = Array.from({ length: 20 }, (_, i) => word("w", i * 500, (i + 1) * 500));
    const out = trimWordsToVoice(words, track(11000, [[3000, 10000]]))!;
    expect(out[out.length - 1].endMs - out[0].startMs).toBe(6990);
    expect(out[10]).toEqual(words[10]);
  });

  it("gives a word that sat wholly in silence no length, in order", () => {
    const out = trimWordsToVoice([word("I", 50, 140), word("said", 140, 1500)], track(2000, [[800, 1500]]))!;
    expect(out[0].startMs).toBe(800);
    expect(out[0].endMs).toBe(800);
    expect(out[1].startMs).toBe(800);
  });

  it("brings a last word back to where the voice stopped", () => {
    const out = trimWordsToVoice([word("a", 0, 1000), word("b", 1000, 5000)], track(6000, [[0, 2500]]))!;
    expect(out[1].endMs).toBe(2490);
  });

  it("leaves a word edge alone when the voice is there", () => {
    const words = [word("a", 100, 500), word("b", 500, 900)];
    expect(trimWordsToVoice(words, track(1000, [[0, 1000]]))).toEqual(words);
  });

  it("doesn't move words across a pause it isn't sitting in", () => {
    const words = [word("a", 100, 500), word("b", 1000, 1400)];
    expect(trimWordsToVoice(words, track(1500, [[0, 600], [900, 1500]]))).toEqual(words);
  });

  it("ignores a click before the voice", () => {
    const out = trimWordsToVoice([word("a", 0, 1500)], track(2000, [[50, 80], [1000, 1500]]))!;
    expect(out[0].startMs).toBe(1000);
  });

  it("hands back what it can't improve, and doesn't change the input", () => {
    const words = [word("a", 0, 500)];
    const copy = JSON.parse(JSON.stringify(words));
    expect(trimWordsToVoice(null, track(1000, []))).toBeNull();
    expect(trimWordsToVoice(words, track(1000, []))).toBe(words);
    trimWordsToVoice(words, track(1000, [[300, 900]]));
    expect(words).toEqual(copy);
  });
});
