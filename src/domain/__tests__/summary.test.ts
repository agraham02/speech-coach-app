import { EXPLAIN_TOPICS, SUMMARY_PASSAGES, SUM_UP_SUBJECTS } from "../../content/summaryContent";
import { mentions, words } from "../conversation/text";
import { isSummaryDrill, paramsFor, SUMMARY_DRILLS } from "../drills/drillSpecs";
import { evaluateSummary } from "../summary/evaluateSummary";
import { averageSentenceWords, longWords, spokenSentences, syllables } from "../summary/measure";
import { prepareSummary } from "../summary/prepareSummary";
import { splitSentences } from "../cadence/sentences";
import type { TurnMeasurement } from "../conversation/evaluateConversation";

function m(transcript: string, seconds = 10, segments?: string[]): TurnMeasurement {
  // The reply starts 1 s after the prompt; first/last results include the
  // recognizer's first-result latency (see liveTranscript).
  const start = 1000;
  return {
    transcript,
    segments,
    partnerEndAt: 0,
    listenStartAt: 0,
    volume: [],
    firstResultAt: start + 600,
    lastResultAt: start + 600 + seconds * 1000,
  };
}

describe("spokenSentences", () => {
  it("cuts on punctuation when the transcript has it", () => {
    const r = spokenSentences("A clownfish crosses the ocean. He finds his son.");
    expect(r.count).toBe(2);
    expect(r.source).toBe("punctuation");
  });

  it("uses the recognizer's pauses when there is no punctuation", () => {
    const r = spokenSentences("a clownfish crosses the ocean to find his son he learns to let go", ["a clownfish crosses the ocean to find his son", "he learns to let go"]);
    expect(r.count).toBe(2);
    expect(r.source).toBe("pauses");
  });

  it("never lets an unbroken run-on pass as one sentence", () => {
    const run = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const r = spokenSentences(run);
    expect(r.count).toBeGreaterThanOrEqual(3);
    expect(r.source).toBe("length");
  });

  it("counts nothing for an empty answer", () => {
    expect(spokenSentences("   ").count).toBe(0);
  });
});

describe("plain words", () => {
  it("counts syllables roughly", () => {
    expect(syllables("cat")).toBe(1);
    expect(syllables("water")).toBe(2);
    expect(syllables("temperature")).toBeGreaterThanOrEqual(3);
    expect(syllables("evaporate")).toBeGreaterThanOrEqual(3);
  });

  it("skips the subject's own words and everyday long words", () => {
    const r = longWords("A microwave basically shakes the water. Electromagnetic radiation does this.", ["microwave"]);
    expect(r.long).toContain("electromagnetic");
    expect(r.long).not.toContain("microwave");
    expect(r.long).not.toContain("basically");
  });

  it("averages sentence length", () => {
    expect(averageSentenceWords(spokenSentences("One two three. Four five six seven."))).toBe(3.5);
  });
});

describe("prepareSummary", () => {
  it.each(SUMMARY_DRILLS.flatMap((t) => [1, 5, 10].map((level) => [t, level] as const)))("builds a playable %s setup at level %i", (type, level) => {
    const s = prepareSummary(type, level, 3);
    expect(s.turns.length).toBeGreaterThan(0);
    for (const t of s.turns) {
      expect(t.show.length).toBeGreaterThan(0);
      expect(t.sentenceLimit).toBeGreaterThan(0);
      expect(t.budgetSeconds).toBeGreaterThan(0);
    }
  });

  it("asks for less as the level rises", () => {
    expect(paramsFor("sum_up", 1).budgetSeconds!).toBeGreaterThan(paramsFor("sum_up", 10).budgetSeconds!);
    expect(paramsFor("sum_up", 1).sentenceLimit).toBe(2);
    expect(paramsFor("sum_up", 10).sentenceLimit).toBe(1);
    expect(paramsFor("explain_simple", 1).maxSentenceWords!).toBeGreaterThan(paramsFor("explain_simple", 10).maxSentenceWords!);
    expect(paramsFor("relay", 1).paragraphs).toBe(3);
    expect(paramsFor("relay", 10).paragraphs).toBe(5);
  });

  it("starts rolling from the third paragraph", () => {
    const s = prepareSummary("relay", 5, 0, "sp01");
    expect(s.turns.map((t) => t.rolling)).toEqual([false, false, true, true]);
    // The previous paragraph is checked by the words that are its own, not ones both share.
    expect(s.turns[2].prevKeyWords).toEqual(s.turns[1].keyWords.filter((k) => !s.turns[2].keyWords.includes(k)));
    expect(s.turns.every((t) => t.hideWhileSpeaking)).toBe(true);
  });

  it("recognizes its own drill types", () => {
    for (const t of SUMMARY_DRILLS) expect(isSummaryDrill(t)).toBe(true);
    expect(isSummaryDrill("squeeze")).toBe(false);
  });
});

describe("evaluateSummary: sum it up", () => {
  const setup = prepareSummary("sum_up", 1, 0, "su01");

  it("passes a short, finished summary", () => {
    const { outcome, details } = evaluateSummary(setup, [m("A nervous clownfish crosses the ocean to find his lost son. He learns to let go.", 9)]);
    expect(details.turns[0].withinSentences).toBe(true);
    expect(outcome.success).toBe(true);
  });

  it("fails an answer that runs past the sentence limit and the clock", () => {
    const { outcome, details } = evaluateSummary(setup, [m("A fish. He swims. He finds a turtle. They talk. Then a shark. Then more.", 45)]);
    expect(details.turns[0].withinSentences).toBe(false);
    expect(details.turns[0].withinBudget).toBe(false);
    expect(outcome.success).toBe(false);
  });

  it("scores nothing when nothing was said", () => {
    const { outcome } = evaluateSummary(setup, [m("", 0)]);
    expect(outcome.score).toBe(0);
    expect(outcome.success).toBe(false);
  });

  it("lets an AI review lead the content part", () => {
    const answer = [m("A nervous clownfish crosses the ocean to find his lost son. He learns to let go.", 9)];
    const good = evaluateSummary(setup, answer, { drill: "sum_up", core: "yes", accurate: "yes", note: "You caught it.", cut: "", tighter: "Short." });
    const bad = evaluateSummary(setup, answer, { drill: "sum_up", core: "no", accurate: "no", note: "That's a different film.", cut: "", tighter: "Short." });
    expect(good.outcome.score).toBeGreaterThan(bad.outcome.score);
    expect(bad.outcome.success).toBe(false);
  });
});

describe("evaluateSummary: rolling summary", () => {
  const setup = prepareSummary("relay", 1, 0, "sp01");

  it("checks key words and the link back on rolling turns", () => {
    const good = evaluateSummary(setup, [
      m("Mara tends a lighthouse. She lights the lamp for ships.", 8),
      m("A storm hit. The waves rose and she kept the lamp lit.", 8),
      m("The storm hit. Then the lamp went out and she needed oil.", 9),
    ]);
    const third = good.details.turns[2];
    expect(third.keyHits).toContain("lamp");
    expect(third.prevHits).toContain("storm");
    expect(good.outcome.success).toBe(true);

    const forgot = evaluateSummary(setup, [
      m("Mara tends a lighthouse. She lights the lamp for ships.", 8),
      m("A storm hit. The waves rose and she kept the lamp lit.", 8),
      m("The lamp went out and she needed oil.", 9),
    ]);
    expect(forgot.details.turns[2].prevHits).toEqual([]);
    expect(forgot.outcome.score).toBeLessThan(good.outcome.score);
  });

  it("uses the AI's verdicts when there is a review", () => {
    const answers = [m("Mara tends a lighthouse. She lights the lamp for ships.", 8), m("A storm hit. The waves rose.", 8), m("The lamp went out and she needed oil.", 8)];
    const review = {
      drill: "relay" as const,
      turns: [
        { mainIdea: "yes" as const, linkedBack: "not_applicable" as const, missed: "" },
        { mainIdea: "yes" as const, linkedBack: "not_applicable" as const, missed: "" },
        { mainIdea: "no" as const, linkedBack: "no" as const, missed: "the broken chimney" },
      ],
      note: "Strong start.",
      tighter: "Keep the thread.",
    };
    const r = evaluateSummary(setup, answers, review);
    expect(r.details.turns[2].mainIdea).toBe("no");
    expect(r.outcome.success).toBe(false);
  });
});

describe("evaluateSummary: explain it simply", () => {
  const setup = prepareSummary("explain_simple", 1, 0, "ex01");

  it("passes short sentences in everyday words", () => {
    const { outcome, details } = evaluateSummary(setup, [m("A microwave shakes the tiny bits of water in your food. The shaking makes heat. The heat warms the food.", 12)]);
    expect(details.turns[0].avgSentenceWords!).toBeLessThanOrEqual(16);
    expect(outcome.success).toBe(true);
  });

  it("flags jargon and long sentences", () => {
    const { outcome, details } = evaluateSummary(setup, [
      m("A microwave generates electromagnetic radiation which causes dipolar molecules to oscillate and thereby produces thermal energy throughout the heterogeneous substance being heated.", 12),
    ]);
    expect(details.turns[0].longWords).toContain("electromagnetic");
    expect(outcome.success).toBe(false);
  });
});

describe("summary content", () => {
  const ids = [...SUM_UP_SUBJECTS.map((s) => s.id), ...SUMMARY_PASSAGES.map((p) => p.id), ...EXPLAIN_TOPICS.map((t) => t.id)];

  it("has unique ids", () => {
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has enough of each, spread across levels", () => {
    expect(SUM_UP_SUBJECTS.length).toBeGreaterThanOrEqual(40);
    expect(EXPLAIN_TOPICS.length).toBeGreaterThanOrEqual(24);
    expect(SUMMARY_PASSAGES.length).toBeGreaterThanOrEqual(8);
    for (const level of [1, 2, 3] as const) {
      expect(SUM_UP_SUBJECTS.filter((s) => s.level === level).length).toBeGreaterThanOrEqual(10);
      expect(EXPLAIN_TOPICS.filter((s) => s.level === level).length).toBeGreaterThanOrEqual(8);
      expect(SUMMARY_PASSAGES.filter((s) => s.level === level).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("gives every subject an example of at most two sentences, except the speaker's own", () => {
    for (const s of SUM_UP_SUBJECTS) {
      if (s.kind === "own") {
        expect(s.example).toBeUndefined();
        continue;
      }
      expect(s.example).toBeTruthy();
      expect(splitSentences(s.example!).length).toBeLessThanOrEqual(2);
    }
  });

  it("keeps passages five paragraphs of 35 to 80 words, with key words inside them", () => {
    for (const p of SUMMARY_PASSAGES) {
      expect(p.paragraphs).toHaveLength(5);
      for (const para of p.paragraphs) {
        const n = words(para.text).length;
        expect(n).toBeGreaterThanOrEqual(35);
        expect(n).toBeLessThanOrEqual(80);
        expect(para.keyWords.length).toBeGreaterThanOrEqual(3);
        expect(para.keyWords.length).toBeLessThanOrEqual(5);
        for (const k of para.keyWords) expect(mentions(para.text, k)).toBe(true);
        expect(splitSentences(para.example).length).toBeLessThanOrEqual(2);
      }
    }
  });

  it("gives every explain topic a short example, and its subject words", () => {
    for (const t of EXPLAIN_TOPICS) {
      expect(t.keep.length).toBeGreaterThan(0);
      expect(splitSentences(t.example).length).toBeLessThanOrEqual(3);
      expect(averageSentenceWords(spokenSentences(t.example))).toBeLessThanOrEqual(22);
    }
  });
});
