import { DEFAULT_LINK_THRESHOLDS, fitTopicBars, goldLinks, linkVerdict, meanVector, scoreGold, sentencesOf, topicVerdict, tuneLinkThresholds, type TopicReading } from "../meaning";
import { CATEGORY_ANCHORS, CATEGORY_GOLD, TOPIC_GOLD, WORD_CHAIN_GOLD, WORD_CHAIN_LINKS } from "../gold";
import { FLUENCY_CATEGORIES } from "../../../content/drillContent";

describe("linkVerdict", () => {
  it("is strong, a stretch or none by the two cuts", () => {
    expect(linkVerdict(0.6, DEFAULT_LINK_THRESHOLDS)).toBe("strong");
    expect(linkVerdict(0.4, DEFAULT_LINK_THRESHOLDS)).toBe("loose");
    expect(linkVerdict(0.1, DEFAULT_LINK_THRESHOLDS)).toBe("none");
  });
});

describe("the gold set", () => {
  it("is the Word Chain cases in spikes/inference-eval, plus ours", () => {
    const spike = require("../../../../spikes/inference-eval/cases_synthetic.json").word_chain as { id: string; words: string[]; gold: string[] }[];
    expect(WORD_CHAIN_GOLD.slice(0, spike.length)).toEqual(spike.map((c) => ({ id: c.id, words: c.words, gold: c.gold })));
  });

  it("has one verdict for every link in every chain", () => {
    for (const c of WORD_CHAIN_GOLD) expect(c.gold).toHaveLength(c.words.length - 1);
    expect(WORD_CHAIN_LINKS.length).toBe(WORD_CHAIN_GOLD.reduce((n, c) => n + c.gold.length, 0));
  });

  it("has enough broken and good links to mean something", () => {
    expect(WORD_CHAIN_LINKS.filter((l) => l.gold === "none").length).toBeGreaterThanOrEqual(10);
    expect(WORD_CHAIN_LINKS.filter((l) => l.gold === "strong").length).toBeGreaterThanOrEqual(25);
  });

  it("anchors every category the drill can ask for, except the ones that can't be checked", () => {
    const unanchored = FLUENCY_CATEGORIES.filter((c) => !CATEGORY_ANCHORS[c.id]).map((c) => c.id);
    // Colours, shapes, abstract things and phrases: no single word stands for them.
    expect(unanchored.sort()).toEqual(["abstract", "adjectives_people", "red", "round", "verbs_speak"]);
    for (const c of CATEGORY_GOLD) expect(CATEGORY_ANCHORS[c.category]).toBeDefined();
  });

  it("has the topic cases in threes: on, off and gibberish for each prompt", () => {
    expect(TOPIC_GOLD.filter((c) => c.kind === "on")).toHaveLength(4);
    expect(TOPIC_GOLD.filter((c) => c.kind === "off")).toHaveLength(4);
    expect(TOPIC_GOLD.filter((c) => c.kind === "gibberish")).toHaveLength(4);
  });
});

// A pretend phone: a similarity per link from its gold verdict, with some spread.
function pretend(good: number, broken: number, spread = 0.05) {
  return WORD_CHAIN_LINKS.map((l, i) => (l.gold === "none" ? broken : good) + (i % 3 === 0 ? spread : -spread));
}

describe("scoreGold", () => {
  it("passes a phone that tells good links from broken ones", () => {
    const r = scoreGold(WORD_CHAIN_LINKS, pretend(0.6, 0.1), DEFAULT_LINK_THRESHOLDS);
    expect(r.catchRate).toBe(1);
    expect(r.wrongRate).toBe(0);
    expect(r.passes).toBe(true);
  });

  it("fails a phone that calls everything a link, however kind", () => {
    const r = scoreGold(WORD_CHAIN_LINKS, pretend(0.6, 0.6), DEFAULT_LINK_THRESHOLDS);
    expect(r.catchRate).toBe(0);
    expect(r.passes).toBe(false);
  });

  it("fails a phone that fails real links", () => {
    const r = scoreGold(WORD_CHAIN_LINKS, pretend(0.1, 0.1), DEFAULT_LINK_THRESHOLDS);
    expect(r.wrongRate).toBe(1);
    expect(r.passes).toBe(false);
  });

  it("can't pass when words had no vector: that's not checked, not a pass", () => {
    const sims = pretend(0.6, 0.1).map((s, i) => (i % 2 === 0 ? null : s));
    const r = scoreGold(WORD_CHAIN_LINKS, sims, DEFAULT_LINK_THRESHOLDS);
    expect(r.unchecked).toBeGreaterThan(0);
    expect(r.passes).toBe(false);
  });

  it("accepts either answer where the gold allows two, counting neither as a miss", () => {
    const links = goldLinks([{ words: ["a", "b", "c"], gold: ["loose|none", "strong"] }]);
    const r = scoreGold(links, [0.1, 0.6], DEFAULT_LINK_THRESHOLDS);
    expect(r.broken).toBe(0);
    expect(r.wronglyFailed).toBe(0);
  });
});

describe("tuneLinkThresholds", () => {
  it("keeps the defaults when they pass", () => {
    expect(tuneLinkThresholds(WORD_CHAIN_LINKS, pretend(0.6, 0.1)).thresholds).toEqual(DEFAULT_LINK_THRESHOLDS);
  });

  it("moves the cut to where this phone's vectors separate", () => {
    // A phone whose similarities all run low: good links near 0.2, broken near 0.02.
    const { thresholds, result } = tuneLinkThresholds(WORD_CHAIN_LINKS, pretend(0.22, 0.02, 0.01));
    expect(result.passes).toBe(true);
    expect(thresholds.loose).toBeLessThan(0.2);
    expect(thresholds.loose).toBeGreaterThan(0.04);
  });

  it("still fails when nothing separates them", () => {
    expect(tuneLinkThresholds(WORD_CHAIN_LINKS, pretend(0.3, 0.3)).result.passes).toBe(false);
  });
});

describe("topic bars", () => {
  const reading = (kind: string, onTopic: number, coherence: number | null) => ({ kind, onTopic, coherence });
  const readings = (values: Record<string, [number, number | null]>): (TopicReading | null)[] => {
    const seen: Record<string, number> = {};
    return TOPIC_GOLD.map((c) => {
      const [onTopic, coherence] = values[c.kind];
      seen[c.kind] = (seen[c.kind] ?? 0) + 1;
      return reading(c.kind, onTopic + seen[c.kind] * 0.01, coherence != null ? coherence + seen[c.kind] * 0.01 : null) as TopicReading;
    });
  };

  it("draws the line near the off-topic side when the groups separate", () => {
    const fit = fitTopicBars(TOPIC_GOLD, readings({ on: [0.7, 0.6], off: [0.3, 0.5], gibberish: [0.2, 0.1] }));
    expect(fit.ok).toBe(true);
    const bars = fit.bars!;
    // Highest off-topic is about 0.34; lowest on-topic about 0.71.
    expect(bars.offTopicBelow).toBeGreaterThan(0.34);
    expect(bars.offTopicBelow).toBeLessThan(0.52);
    expect(bars.incoherentBelow).not.toBeNull();
    expect(topicVerdict({ onTopic: 0.7, coherence: 0.6 }, bars)).toBe("ok");
    expect(topicVerdict({ onTopic: 0.25, coherence: 0.5 }, bars)).toBe("off_topic");
    expect(topicVerdict({ onTopic: 0.7, coherence: 0.1 }, bars)).toBe("incoherent");
  });

  it("switches itself off when on-topic and off-topic answers overlap", () => {
    const fit = fitTopicBars(TOPIC_GOLD, readings({ on: [0.5, 0.5], off: [0.48, 0.5], gibberish: [0.3, 0.1] }));
    expect(fit.ok).toBe(false);
    expect(fit.bars).toBeNull();
  });

  it("has no coherence line when gibberish reads as coherent as real answers", () => {
    const fit = fitTopicBars(TOPIC_GOLD, readings({ on: [0.7, 0.5], off: [0.3, 0.5], gibberish: [0.2, 0.5] }));
    expect(fit.ok).toBe(true);
    expect(fit.bars!.incoherentBelow).toBeNull();
    expect(topicVerdict({ onTopic: 0.7, coherence: 0.0 }, fit.bars!)).toBe("ok");
  });

  it("says nothing when too few cases could be read", () => {
    expect(fitTopicBars(TOPIC_GOLD, TOPIC_GOLD.map(() => null)).ok).toBe(false);
  });
});

describe("sentencesOf", () => {
  it("splits on full stops and joins fragments to a neighbour", () => {
    expect(sentencesOf("I woke up early. Then coffee. It was a quiet morning and I enjoyed it.")).toEqual(["I woke up early.", "Then coffee. It was a quiet morning and I enjoyed it."]);
  });

  it("cuts a long run with no punctuation into pieces", () => {
    const text = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const parts = sentencesOf(text);
    expect(parts.length).toBeGreaterThanOrEqual(3);
    expect(parts.join(" ")).toBe(text);
  });

  it("caps the number of sentences", () => {
    expect(sentencesOf(Array.from({ length: 30 }, () => "This is a sentence here.").join(" "), 5)).toHaveLength(5);
  });
});

describe("meanVector", () => {
  it("averages, and refuses vectors of different lengths", () => {
    expect(meanVector([[1, 3], [3, 5]])).toEqual([2, 4]);
    expect(meanVector([[1, 2], [1]])).toBeNull();
    expect(meanVector([])).toBeNull();
  });
});
