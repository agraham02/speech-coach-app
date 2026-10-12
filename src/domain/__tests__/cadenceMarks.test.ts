import { parseNotation, toNotation } from "../cadence/notation";
import { autoMark, remixEmphasis } from "../cadence/autoMark";
import {
  addSpan,
  clearWord,
  compareMarks,
  cycleGap,
  filterMarks,
  marksByWord,
  phrases,
  sanitizeMarks,
  sliceMarked,
  fillPlaceholder,
  toggleEmphasis,
  toggleInflection,
  type Mark,
} from "../cadence/marks";
import { splitSentences } from "../cadence/sentences";
import { lineRepConfig, lineOfTheDay, pickLines } from "../cadence/lineRep";
import { getLines } from "../../content/lines";
import { hashString } from "../dailyPlan";
import { acceptModelMarks } from "../cadence/autoMarkPrompt";

const kinds = (marks: Mark[], kind: Mark["kind"]) => marks.filter((m) => m.kind === kind);

describe("notation", () => {
  it("parses stress, inflection, pauses, spans and notes", () => {
    const { text, marks } = parseNotation("[[Warm]] *Thirty* seconds.↘ || That's {slow about how long} I have | before you check your *phone,*↗ | so");
    expect(text).toBe("Thirty seconds. That's about how long I have before you check your phone, so");
    const w = marksByWord({ text, marks });
    expect(w[0]).toMatchObject({ word: "Thirty", emphasis: true, note: "Warm" });
    expect(w[1]).toMatchObject({ inflection: "fall", gapAfter: "long_pause" });
    expect(w[3].spans).toEqual(["slow"]);
    expect(w[5].spans).toEqual(["slow"]);
    expect(w[6].spans).toEqual([]);
    expect(w[7].gapAfter).toBe("pause");
    expect(w[12]).toMatchObject({ word: "phone,", emphasis: true, inflection: "rise", gapAfter: "pause" });
  });

  it("round-trips", () => {
    const source = "[[Sincere]] I've known *him* a long time.↘ || {softer I have *never,*↗ | not once.↘}";
    const parsed = parseNotation(source);
    expect(parseNotation(toNotation(parsed))).toEqual(parsed);
  });

  it("splits into breath groups at pauses", () => {
    const marked = parseNotation("one two | three four || five");
    expect(phrases(marked)).toEqual([
      { from: 0, to: 1 },
      { from: 2, to: 3 },
      { from: 4, to: 4 },
    ]);
  });
});

describe("autoMark (marking guide)", () => {
  it("pauses at every phrase boundary and inflects every sentence end", () => {
    const { marks } = autoMark("Thirty seconds. That's about how long I have before you check your phone, so let's not waste it.");
    expect(kinds(marks, "long_pause")).toEqual([{ kind: "long_pause", afterWord: 1 }]);
    expect(kinds(marks, "pause")).toContainEqual({ kind: "pause", afterWord: 12 });
    expect(kinds(marks, "fall").map((m) => (m as { word: number }).word)).toEqual([1, 17]);
    expect(kinds(marks, "rise").map((m) => (m as { word: number }).word)).toEqual([12]);
  });

  it("stresses numbers and negations over the default last word", () => {
    const { text, marks } = autoMark("Thirty seconds. Let's not waste it.");
    const words = text.split(" ");
    const stressed = kinds(marks, "emphasis").map((m) => words[(m as { word: number }).word]);
    expect(stressed).toEqual(["Thirty", "not"]);
  });

  it("defaults to the last content word of a phrase", () => {
    const { text, marks } = autoMark("We built it for them.");
    const words = text.split(" ");
    expect(kinds(marks, "emphasis").map((m) => words[(m as { word: number }).word])).toEqual(["built"]);
  });

  it("takes a breath in long phrases at a natural break", () => {
    const marked = autoMark("I build software that gives small business owners back their evenings.");
    const words = marked.text.split(" ");
    expect(kinds(marked.marks, "pause")).toEqual([{ kind: "pause", afterWord: 2 }]);
    expect(kinds(marked.marks, "emphasis").map((m) => words[(m as { word: number }).word])).toEqual(["software", "evenings."]);
  });

  it("doesn't end a sentence at a.m., or pause twice around a dash", () => {
    const marked = autoMark("I stood there at 2 a.m. watching it — all of it — fail.");
    expect(kinds(marked.marks, "long_pause")).toEqual([]);
    const gaps = kinds(marked.marks, "pause").map((m) => (m as { afterWord: number }).afterWord);
    const words = marked.text.split(" ");
    expect(gaps.map((g) => words[g])).toEqual(["—", "—"]);
  });

  it("lets a pronoun carry the stress when nothing else can, and reads 'So what…?' as a wh-question", () => {
    const a = autoMark("Because it's ours.");
    expect(kinds(a.marks, "emphasis")).toEqual([{ kind: "emphasis", word: 2 }]);
    expect(kinds(autoMark("So what do you do with that?").marks, "fall")).toHaveLength(1);
    expect(kinds(autoMark("Or are we the team that stays?").marks, "fall")).toHaveLength(1);
  });

  it("stresses the word after 'but'", () => {
    const { text, marks } = autoMark("It was late but nobody wanted to leave.");
    const words = text.split(" ");
    expect(kinds(marks, "emphasis").map((m) => words[(m as { word: number }).word])).toEqual(["nobody"]);
  });

  it("rises on yes/no questions and falls on wh-questions", () => {
    expect(kinds(autoMark("Can I show you how it works?").marks, "rise")).toHaveLength(1);
    expect(kinds(autoMark("What would you do with an extra morning?").marks, "fall")).toHaveLength(1);
  });

  it("rises on list items and falls on the last one", () => {
    const { marks } = autoMark("We need speed, clarity, and trust.");
    expect(kinds(marks, "rise").map((m) => (m as { word: number }).word)).toEqual([2, 3]);
    expect(kinds(marks, "fall").map((m) => (m as { word: number }).word)).toEqual([5]);
  });

  it("puts at most one stress in each phrase", () => {
    const marked = autoMark("The average shop owner spends eleven hours a week on scheduling, invoicing, and chasing no-shows.");
    const groups = phrases(marked);
    for (const g of groups) {
      const n = kinds(marked.marks, "emphasis").filter((m) => (m as { word: number }).word >= g.from && (m as { word: number }).word <= g.to).length;
      expect(n).toBeLessThanOrEqual(1);
    }
  });
});

describe("editing", () => {
  it("toggles and cycles", () => {
    let m: Mark[] = [];
    m = toggleEmphasis(m, 2);
    expect(m).toEqual([{ kind: "emphasis", word: 2 }]);
    m = toggleInflection(m, 2, "rise");
    m = toggleInflection(m, 2, "fall");
    expect(kinds(m, "rise")).toHaveLength(0);
    expect(kinds(m, "fall")).toHaveLength(1);
    m = cycleGap(m, 2);
    m = cycleGap(m, 2);
    expect(kinds(m, "long_pause")).toHaveLength(1);
    m = cycleGap(m, 2);
    expect(kinds(m, "long_pause")).toHaveLength(0);
    m = addSpan(m, "slow", 4, 1);
    expect(kinds(m, "slow")).toEqual([{ kind: "slow", from: 1, to: 4 }]);
    m = clearWord(m, 2);
    expect(m).toEqual([]);
  });

  it("drops out-of-range marks and a pause after the last word", () => {
    const clean = sanitizeMarks(
      [
        { kind: "emphasis", word: 9 },
        { kind: "pause", afterWord: 2 },
        { kind: "rise", word: 1 },
        { kind: "fall", word: 1 },
      ],
      3,
    );
    expect(clean).toEqual([{ kind: "fall", word: 1 }]);
  });

  it("filters by mark level", () => {
    const marks = autoMark("Well, it was not great. But it worked.").marks;
    expect(filterMarks(marks, "none")).toEqual([]);
    expect(filterMarks(marks, "light").every((m) => m.kind === "emphasis" || m.kind === "pause" || m.kind === "long_pause")).toBe(true);
  });

  it("compares your marks with the coach's", () => {
    const coach: Mark[] = [
      { kind: "pause", afterWord: 1 },
      { kind: "emphasis", word: 3 },
      { kind: "fall", word: 5 },
    ];
    const mine: Mark[] = [
      { kind: "long_pause", afterWord: 1 },
      { kind: "emphasis", word: 2 },
    ];
    expect(compareMarks(mine, coach)).toEqual({ shared: 1, mineOnly: 1, coachOnly: 2 });
  });

  it("remixes the stress onto another word", () => {
    const marked = parseNotation("I never said she *stole* it.↘");
    const remix = remixEmphasis(marked, 0)!;
    expect(kinds(remix.marks, "emphasis")).toHaveLength(1);
    expect(kinds(remix.marks, "emphasis")[0]).not.toEqual({ kind: "emphasis", word: 4 });
    expect(kinds(remix.marks, "fall")).toHaveLength(1);
  });
});

describe("splitSentences", () => {
  it("splits on sentence ends but not abbreviations", () => {
    expect(splitSentences("Dr. Smith arrived. He was late! Was he? Yes.")).toEqual(["Dr. Smith arrived.", "He was late!", "Was he?", "Yes."]);
  });

  it("joins scanned line breaks and hyphenation", () => {
    expect(splitSentences("It was the best of\ntimes, it was the wor-\nst of times.")).toEqual(["It was the best of times, it was the worst of times."]);
  });
});


describe("line rep", () => {
  it("never goes past two sentences and hands over more marking as you level", () => {
    expect(lineRepConfig(1)).toMatchObject({ mode: "given", maxSentences: 1 });
    expect(lineRepConfig(5)).toMatchObject({ mode: "add_pauses", maxSentences: 2 });
    expect(lineRepConfig(10)).toMatchObject({ mode: "mark_all", maxSentences: 2, remix: true });
  });

  it("picks lines that fit the level, from a category, avoiding recent ones", () => {
    const lines = getLines();
    const picked = pickLines(lines, lineRepConfig(1), 3, { category: "questions", recentIds: ["q01"] });
    expect(picked).toHaveLength(3);
    expect(new Set(picked.map((l) => l.id)).size).toBe(3);
    for (const l of picked) {
      expect(l.category).toBe("questions");
      expect(l.sentences).toBe(1);
      expect(l.id).not.toBe("q01");
    }
  });

  it("puts a tapped line first", () => {
    const picked = pickLines(getLines(), lineRepConfig(1), 0, { firstId: "p10" });
    expect(picked[0].id).toBe("p10");
    expect(picked).toHaveLength(3);
  });

  it("keeps the same line of the day all day", () => {
    const lines = getLines();
    expect(lineOfTheDay(lines, "2026-10-11", hashString).id).toBe(lineOfTheDay(lines, "2026-10-11", hashString).id);
  });
});

describe("model marks", () => {
  it("accepts the model's notation when the words match", () => {
    const marked = acceptModelMarks("Can I show you how it works?", "Can I *show* you | how it *works*?↗");
    expect(marked?.marks).toHaveLength(4);
    expect(marked?.text).toBe("Can I show you how it works?");
  });

  it("rejects it when the model changed a word", () => {
    expect(acceptModelMarks("Can I show you how it works?", "Can I *show* you | how this *works*?↗")).toBeNull();
    expect(acceptModelMarks("Can I show you how it works?", "Can I show you how it works?")).toBeNull();
  });
});


describe("sliceMarked", () => {
  it("re-indexes marks for one breath group and clips spans", () => {
    const marked = parseNotation("one {slow two | *three* four↘ || five}");
    const slice = sliceMarked(marked, 2, 3);
    expect(slice.text).toBe("three four");
    expect(slice.marks).toEqual(
      expect.arrayContaining([
        { kind: "emphasis", word: 0 },
        { kind: "fall", word: 1 },
        { kind: "long_pause", afterWord: 1 },
        { kind: "slow", from: 0, to: 1 },
      ]),
    );
  });
});

describe("placeholders", () => {
  it("fills [Name] for display only", () => {
    expect(fillPlaceholder("[Name],", "Sam")).toBe("Sam,");
    expect(fillPlaceholder("[Groom]'s", "Sam")).toBe("[Groom]'s");
    expect(fillPlaceholder("[Name].", undefined)).toBe("[Name].");
  });
});
