import { getLines, LINE_CATEGORIES } from "../../content/lines";
import { marksByWord, phrases } from "../cadence/marks";

// Every built-in line has to follow the marking guide
// (practice-expansion-plan.md §4.6).
describe("built-in lines", () => {
  const lines = getLines();

  it("has about 150 lines with unique ids in every category", () => {
    expect(lines.length).toBeGreaterThanOrEqual(150);
    expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
    for (const c of LINE_CATEGORIES) expect(lines.filter((l) => l.category === c.id).length).toBeGreaterThanOrEqual(15);
  });

  it.each(lines.map((l) => [l.id, l] as const))("%s is one or two sentences and follows the guide", (_id, line) => {
    expect(line.sentences).toBeGreaterThanOrEqual(1);
    expect(line.sentences).toBeLessThanOrEqual(2);
    const words = marksByWord(line);
    words.forEach((w, i) => {
      const last = i === words.length - 1;
      // every sentence end gets an inflection, and a long pause unless it's the end
      if (/[.!?]["')\]]*$/.test(w.word)) {
        expect(w.inflection).not.toBeNull();
        if (!last) expect(w.gapAfter).toBe("long_pause");
      }
      // every comma / semicolon / colon / dash is a phrase boundary with a pause
      if (!last && (/[,;:]$/.test(w.word) || w.word === "—")) expect(w.gapAfter).not.toBeNull();
    });
    expect(words[words.length - 1].gapAfter).toBeNull();
    // at most one stress per phrase, and at least one in the line
    for (const g of phrases(line)) {
      expect(words.slice(g.from, g.to + 1).filter((w) => w.emphasis).length).toBeLessThanOrEqual(1);
    }
    expect(words.some((w) => w.emphasis)).toBe(true);
  });
});
