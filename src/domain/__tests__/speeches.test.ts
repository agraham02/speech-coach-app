import scripts from "../../data/scripts.json";
import { getSpeeches } from "../../content/speeches";
import { marksByWord, phrases } from "../cadence/marks";
import { tokenizeScript } from "../scriptTypes";

// The re-marked speeches must keep the scripts' exact words (the Gemini
// script prompt and the teleprompter index into them) and follow the
// marking guide (docs/history/practice-expansion-plan.md §4.6).
describe("speeches", () => {
  const speeches = getSpeeches();

  it("covers every script", () => {
    expect(speeches.map((s) => s.id)).toEqual((scripts as { id: string }[]).map((s) => s.id));
  });

  it.each(speeches.map((s) => [s.id, s] as const))("%s keeps the script's words and follows the guide", (id, speech) => {
    const script = (scripts as { id: string; text: string }[]).find((s) => s.id === id)!;
    expect(tokenizeScript(speech.text)).toEqual(tokenizeScript(script.text));
    const words = marksByWord(speech);
    words.forEach((w, i) => {
      const last = i === words.length - 1;
      if (/[.!?]["')\]]*$/.test(w.word) && !/^(a\.m\.|p\.m\.)$/i.test(w.word)) {
        expect(w.inflection).not.toBeNull();
        if (!last) expect(w.gapAfter).toBe("long_pause");
      }
      if (!last && /[,;:]$/.test(w.word)) expect(w.gapAfter).not.toBeNull();
    });
    let longest = 0;
    for (const g of phrases(speech)) {
      expect(words.slice(g.from, g.to + 1).filter((w) => w.emphasis).length).toBeLessThanOrEqual(1);
      longest = Math.max(longest, g.to - g.from + 1);
    }
    // a breath every few words
    expect(longest).toBeLessThanOrEqual(13);
    // the old version had 2-5 pauses; the guide asks for one every 4-8 words
    const gaps = words.filter((w) => w.gapAfter).length;
    expect(words.length / gaps).toBeLessThan(8);
  });
});
