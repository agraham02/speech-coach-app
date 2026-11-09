// A pretend phone for the meaning check: words sit in clusters (so a pair is close
// when they share a cluster), and sentences are vectors by their subject. What this
// proves is the plumbing and the safety: the phone checks only what it has shown it
// can, and says "not checked" otherwise. How good Apple's real vectors are is what
// Signal Lab's tests measure on the iPhone.
import { CATEGORY_GOLD, TOPIC_GOLD, WORD_CHAIN_LINKS } from "../../../domain/meaning/gold";
import { sentencesOf } from "../../../domain/meaning/meaning";

jest.mock("../../../utils/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
const mockEmbed = jest.fn();
const mockAvailable = jest.fn();
jest.mock("../../../../modules/tono-language", () => ({
  embed: (...args: unknown[]) => mockEmbed(...args),
  embeddingAvailable: (...args: unknown[]) => mockAvailable(...args),
}));

import { checkCategoryWords, checkCoherence, checkTopic, meaningCheck, phoneJudgeChain, resetMeaningCheck } from "../meaningCheck";

// Every word of a gold chain gets its own axis plus a shared axis with the words it
// is meant to link to, so strong links are close and broken ones are not.
const CATEGORY_DIMS = 40;
const CHAIN_WORDS = new Set(WORD_CHAIN_LINKS.flatMap((l) => [l.from, l.to]));

function wordVectors(good: boolean) {
  const axes = new Map<string, number>();
  const axis = (w: string) => {
    if (!axes.has(w)) axes.set(w, axes.size);
    return axes.get(w)!;
  };
  const linked = new Map<string, Set<string>>();
  for (const l of WORD_CHAIN_LINKS) {
    axis(l.from);
    axis(l.to);
    if (good && l.gold !== "none") {
      for (const [a, b] of [[l.from, l.to], [l.to, l.from]]) linked.set(a, (linked.get(a) ?? new Set()).add(b));
    }
  }
  return (word: string): number[] | null => {
    if (!axes.has(word)) return null;
    const v = new Array(axes.size + CATEGORY_DIMS).fill(0);
    v[axes.get(word)!] = 1;
    for (const other of linked.get(word) ?? []) v[axes.get(other)!] += 1;
    return v;
  };
}

const CATEGORY_WORDS: Record<string, string[]> = {
  animal: ["dog", "elephant", "sparrow", "salmon", "tiger", "cat", "horse"],
  food: ["bread", "apple", "cheese", "noodles", "omelette"],
  job: ["nurse", "plumber", "teacher", "pilot", "farmer"],
  sport: ["tennis", "soccer", "swimming", "hockey", "boxing"],
  emotion: ["anger", "joy", "jealousy", "grief", "pride"],
};

// The topic cases, as a phone would see them: a prompt and its on-topic sentences share
// an axis, off-topic sentences share another, nonsense sentences each have their own.
function topicAxes() {
  const prompts = [...new Set(TOPIC_GOLD.map((c) => c.prompt))];
  const axis = new Map<string, number>();
  prompts.forEach((p, n) => axis.set(p, n));
  let next = 10;
  for (const c of TOPIC_GOLD) {
    for (const sentence of sentencesOf(c.answer)) {
      if (c.kind === "on") axis.set(sentence, prompts.indexOf(c.prompt));
      else axis.set(sentence, next++);
    }
  }
  return { axis, width: next + 1 };
}

function pretendPhone(opts: { chains: boolean; sentences: boolean }) {
  const words = wordVectors(opts.chains);
  const categoryAxis: Record<string, number> = { animal: 0, food: 1, job: 2, sport: 3, emotion: 4 };
  const subjects = ["challenge", "rice", "teacher", "train", "travel", "tire", "sleep", "wedding"];
  const total = (words("pen") ?? []).length;
  const topics = topicAxes();
  return async (kind: string, text: string): Promise<number[] | null> => {
    if (kind === "word") {
      // A word's vector: its chain part (if it is in the gold chains) plus its category part.
      const v = (words(text) ?? new Array(total).fill(0)).slice();
      let known = CHAIN_WORDS.has(text);
      const category = total - CATEGORY_DIMS;
      for (const [anchor, members] of Object.entries(CATEGORY_WORDS)) {
        if (text === anchor || members.includes(text)) {
          v[category + categoryAxis[anchor]] += 1;
          known = true;
        }
      }
      // Words that belong to no category sit on their own axes, far from every anchor.
      const stray = CATEGORY_GOLD.flatMap((c) => c.no).indexOf(text);
      if (stray >= 0) {
        v[category + 10 + stray] += 1;
        known = true;
      }
      return known ? v : null;
    }
    if (!opts.sentences) return null;
    const known = topics.axis.get(text);
    if (known != null) {
      const v = new Array(topics.width + 20).fill(0);
      v[known] = 1;
      return v;
    }
    const lower = text.toLowerCase();
    const v = new Array(topics.width + 20).fill(0);
    const found = subjects.findIndex((s) => lower.includes(s) || (s === "challenge" && /(presentation|nerves|hardest)/.test(lower)) || (s === "teacher" && /(patient|subject|student)/.test(lower)) || (s === "travel" && /(harbor|portugal|sunset|streets)/.test(lower)) || (s === "sleep" && /(repairs|brain|immunity)/.test(lower)) || (s === "rice" && /(rice|boil|pot)/.test(lower)) || (s === "tire" && /(lug|spare|jack|wheel)/.test(lower)) || (s === "train" && /(office|coffee|umbrella|rain)/.test(lower)) || (s === "wedding" && /(wedding|caterer|venue|band)/.test(lower)));
    if (found >= 0) {
      v[found] = 1;
    } else {
      // Nonsense: each sentence points somewhere of its own.
      v[topics.width + ([...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 20)] = 1;
    }
    return v;
  };
}

beforeEach(() => {
  resetMeaningCheck();
  mockEmbed.mockReset();
  mockAvailable.mockReset();
  mockAvailable.mockResolvedValue(true);
});

describe("meaningCheck", () => {
  it("switches every check on for a phone that passes its own tests", async () => {
    mockEmbed.mockImplementation(pretendPhone({ chains: true, sentences: true }));
    const check = await meaningCheck();
    expect(check.available).toBe(true);
    expect(check.links.ready).toBe(true);
    expect(check.category.ready).toBe(true);
    expect(check.topic.ready).toBe(true);
  });

  it("switches word links off when the vectors can't tell a link from a broken one", async () => {
    mockEmbed.mockImplementation(pretendPhone({ chains: false, sentences: true }));
    const check = await meaningCheck();
    expect(check.links.ready).toBe(false);
    expect(await phoneJudgeChain([{ n: 1, from: "dog", to: "bone" }])).toBeNull();
  });

  it("is all off without the native module or on Android", async () => {
    mockAvailable.mockResolvedValue(false);
    const check = await meaningCheck();
    expect(check.available).toBe(false);
    expect(await phoneJudgeChain([{ n: 1, from: "dog", to: "bone" }])).toBeNull();
    expect(await checkCategoryWords(["table"], "animals")).toBeNull();
    expect(await checkTopic("What makes a good teacher?", "A good teacher is patient. ".repeat(10))).toBeNull();
    expect(await checkCoherence("one two three. ".repeat(10))).toBeNull();
  });

  it("runs the self-test once", async () => {
    mockEmbed.mockImplementation(pretendPhone({ chains: true, sentences: true }));
    await meaningCheck();
    const calls = mockEmbed.mock.calls.length;
    await meaningCheck();
    expect(mockEmbed.mock.calls.length).toBe(calls);
  });

  it("stays off when the self-test throws", async () => {
    mockEmbed.mockRejectedValue(new Error("native crash"));
    expect((await meaningCheck()).available).toBe(false);
  });
});

describe("phoneJudgeChain", () => {
  it("judges each link and leaves out words it has no vector for", async () => {
    mockEmbed.mockImplementation(pretendPhone({ chains: true, sentences: true }));
    // dog→bone is strong in the gold set; pumpkin→carburetor is none.
    const judged = await phoneJudgeChain([
      { n: 1, from: "dog", to: "bone" },
      { n: 2, from: "pumpkin", to: "carburetor" },
      { n: 3, from: "bone", to: "zzzxq" },
    ]);
    expect(judged).not.toBeNull();
    expect(judged!.links.map((l) => [l.n, l.verdict])).toEqual([[1, "strong"], [2, "none"]]);
  });

  it("is null when there is nothing to judge", async () => {
    mockEmbed.mockImplementation(pretendPhone({ chains: true, sentences: true }));
    expect(await phoneJudgeChain([])).toBeNull();
  });
});

describe("checkCategoryWords", () => {
  it("finds the words that aren't in the category", async () => {
    mockEmbed.mockImplementation(pretendPhone({ chains: true, sentences: true }));
    const r = await checkCategoryWords(["dog", "cat", "table", "horse"], "animals");
    expect(r!.fits).toEqual(["dog", "cat", "horse"]);
    expect(r!.misfits).toEqual(["table"]);
  });

  it("can't check a category with no single word for it", async () => {
    mockEmbed.mockImplementation(pretendPhone({ chains: true, sentences: true }));
    expect(await checkCategoryWords(["fire", "rose"], "red")).toBeNull();
  });
});

describe("checkTopic and checkCoherence", () => {
  const goodTeacher = "A good teacher is patient and explains the same idea in more than one way. They notice when a student is lost. The best one I had made the subject worth caring about.";

  it("passes an answer about the prompt, flags one about something else", async () => {
    mockEmbed.mockImplementation(pretendPhone({ chains: true, sentences: true }));
    expect(await checkTopic("What makes a good teacher?", goodTeacher)).toBe("ok");
    expect(await checkTopic("What makes a good teacher?", "To change a flat tire, loosen the lug nuts first. Then raise the jack under the frame. Take off the wheel and fit the spare.")).toBe("off_topic");
  });

  it("flags sentences that have nothing to do with each other", async () => {
    mockEmbed.mockImplementation(pretendPhone({ chains: true, sentences: true }));
    const salad = "Orange running the because lamp is thirteen. Mountain softly under the sandwich of bicycle. Tuesday green the answer knife quietly river. Stairs and and the purple tomorrow.";
    expect(await checkCoherence(salad)).toBe("incoherent");
    expect(await checkCoherence(goodTeacher)).toBe("ok");
  });

  it("says nothing when sentence vectors aren't there", async () => {
    mockEmbed.mockImplementation(pretendPhone({ chains: true, sentences: false }));
    expect(await checkTopic("What makes a good teacher?", goodTeacher)).toBeNull();
  });
});

