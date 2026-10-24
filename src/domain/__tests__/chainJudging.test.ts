import {
  acceptBridgeChain,
  acceptWordChain,
  bridgeSegments,
  chainPairs,
  chainSegments,
  MAX_JUDGED_LINKS,
  tallyBridges,
  tallyLinks,
} from "../drills/chainJudging";
import { chainJudgeRequest, evaluateDrill } from "../drills/evaluateDrill";
import { prepareDrill } from "../drills/prepareDrill";
import { chainWords } from "../drills/wordChain";
import { tokenizeHeard } from "../speech/normalize";

// Session 10: judging Word Chain and Bridge Chain. The judge's answers are
// scripted; these tests prove the phone splits the chain correctly, refuses
// an answer that doesn't cover every link or isn't grounded, and scores what
// is left.

const tokens = (text: string) => tokenizeHeard(text).tokens.map((t) => t.raw);

describe("splitting a Word Chain at its fresh words", () => {
  it("gives each run its own start word and links the first word to it", () => {
    const heard = tokens("ink octopus aquarium sail wind boat");
    // The fresh word "river" appeared after the first three words.
    const segments = chainSegments(heard, [0, 3], ["pen", "river"]);
    expect(segments).toEqual([
      { seed: "pen", words: ["ink", "octopus", "aquarium"] },
      { seed: "river", words: ["sail", "wind", "boat"] },
    ]);
    expect(chainPairs(segments).map((p) => `${p.n}:${p.from}>${p.to}`)).toEqual(["1:pen>ink", "2:ink>octopus", "3:octopus>aquarium", "4:river>sail", "5:sail>wind", "6:wind>boat"]);
  });

  it("counts the same words as the phone's own count, whatever the splits", () => {
    const heard = tokens("ink um octopus ink the aquarium river pens fish water");
    const seeds = ["pen", "river"];
    const segments = chainSegments(heard, [0, 5], seeds);
    expect(segments.flatMap((s) => s.words)).toEqual(chainWords(heard, seeds));
  });

  it("survives a final transcript shorter than the live one the splits were noted on", () => {
    const segments = chainSegments(tokens("ink octopus"), [0, 9], ["pen", "river"]);
    expect(segments).toEqual([{ seed: "pen", words: ["ink", "octopus"] }]);
  });

  it("judges at most MAX_JUDGED_LINKS links", () => {
    const many = Array.from({ length: 90 }, (_, i) => `word${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`);
    expect(chainPairs(chainSegments(many, [0], ["pen"]))).toHaveLength(MAX_JUDGED_LINKS);
  });
});

describe("accepting a Word Chain judgement", () => {
  const pairs = chainPairs([{ seed: "pen", words: ["ink", "octopus", "banana"] }]);
  const entries = [
    { n: 1, verdict: "strong", reason: "Pens write with ink." },
    { n: 2, verdict: "strong", reason: "Octopuses squirt ink." },
    { n: 3, verdict: "none", reason: "No link between them." },
  ];

  it("keeps a complete answer, with the phone's own words in each link", () => {
    const out = acceptWordChain({ links: entries.map((e) => ({ ...e, from: "x", to: "y" })) }, pairs);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.links.map((l) => `${l.from}>${l.to}:${l.verdict}`)).toEqual(["pen>ink:strong", "ink>octopus:strong", "octopus>banana:none"]);
      expect(tallyLinks(out.value.links)).toEqual({ strong: 2, loose: 0, none: 1, credit: 2 });
    }
  });

  it("refuses an answer that skips a link, or uses a verdict it wasn't given", () => {
    expect(acceptWordChain({ links: entries.slice(0, 2) }, pairs).ok).toBe(false);
    expect(acceptWordChain({ links: [...entries.slice(0, 2), { n: 3, verdict: "maybe", reason: "?" }] }, pairs).ok).toBe(false);
    expect(acceptWordChain({ nope: true }, pairs).ok).toBe(false);
  });
});

describe("scoring a judged Word Chain", () => {
  const setup = prepareDrill("word_chain", 1, 0, "pen"); // target 8 links
  const judged = (verdicts: ("strong" | "loose" | "none")[]) => ({
    wordChainJudgement: { links: verdicts.map((verdict, i) => ({ n: i + 1, from: "a", to: "b", verdict, reason: "" })) },
  });
  const heard = "ink octopus aquarium fish water ocean boat sail wind";

  it("passes eight clear links", () => {
    const { outcome } = evaluateDrill(setup, { transcript: heard, speakingMs: 20000, volume: [], seedWords: ["pen"], ...judged(Array(8).fill("strong")) });
    expect(outcome.score).toBe(1);
    expect(outcome.success).toBe(true);
    expect(outcome.summary).toBe("8 clear (target 8)");
  });

  it("gives half for a stretch and nothing for a link that doesn't connect", () => {
    const { outcome } = evaluateDrill(setup, { transcript: heard, speakingMs: 20000, volume: [], seedWords: ["pen"], ...judged(["strong", "strong", "strong", "strong", "loose", "loose", "none", "none", "none"]) });
    expect(outcome.score).toBe(0.63); // 4 + 2 half-links = 5 of 8
    expect(outcome.success).toBe(false);
    expect(outcome.summary).toBe("4 clear, 2 a stretch, 3 didn't connect (target 8)");
  });

  it("a chain of nine unrelated words no longer passes just for being nine words", () => {
    const counted = evaluateDrill(setup, { transcript: heard, speakingMs: 20000, volume: [], seedWords: ["pen"] });
    expect(counted.outcome.success).toBe(true);
    expect(counted.outcome.summary).toContain("counted, not checked");
    const checked = evaluateDrill(setup, { transcript: heard, speakingMs: 20000, volume: [], seedWords: ["pen"], ...judged(Array(9).fill("none")) });
    expect(checked.outcome.score).toBe(0);
    expect(checked.outcome.success).toBe(false);
    expect(checked.details.links).toHaveLength(9);
  });

  it("still takes a fresh start's small cost, but never for people who stutter", () => {
    const base = { transcript: heard, speakingMs: 20000, volume: [], seedWords: ["pen", "river", "city"], ...judged(Array(8).fill("strong")) };
    expect(evaluateDrill(setup, base).outcome.score).toBe(0.95);
    expect(evaluateDrill(setup, { ...base, penalizeResets: false }).outcome.score).toBe(1);
  });
});

describe("what a chain attempt sends to be judged", () => {
  it("is null when there was nothing to judge", () => {
    expect(chainJudgeRequest(prepareDrill("word_chain", 1, 0, "pen"), { transcript: "", seedWords: ["pen"], chainStarts: [0] })).toBeNull();
    expect(chainJudgeRequest(prepareDrill("chain_bridge", 1, 0, "pen"), { transcript: "ink because", seedWords: ["pen"], chainStarts: [0] })).toBeNull();
    expect(chainJudgeRequest(prepareDrill("category_fluency", 1, 0), { transcript: "cat dog", seedWords: [], chainStarts: [0] })).toBeNull();
  });

  it("is the words only, split into runs", () => {
    const req = chainJudgeRequest(prepareDrill("word_chain", 1, 0, "pen"), { transcript: "ink octopus um aquarium", seedWords: ["pen"], chainStarts: [0] });
    expect(req).toMatchObject({ kind: "word_chain", input: { segments: [{ seed: "pen", words: ["ink", "octopus", "aquarium"] }] } });
  });
});

describe("accepting a Bridge Chain judgement", () => {
  const said = "ink because pens write with ink octopus because they go together aquarium";
  const segments = bridgeSegments(tokens(said), [0], ["pen"]);
  const step = (word: string, reason: string, verdict: string, note = "") => ({ word, reason, verdict, note });

  it("keeps steps whose words were said and whose reasons are word for word", () => {
    const out = acceptBridgeChain({ steps: [step("ink", "pens write with ink", "explained"), step("octopus", "they go together", "thin"), step("aquarium", "", "unexplained")] }, segments);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.steps.map((s) => s.verdict)).toEqual(["explained", "thin", "unexplained"]);
      expect(tallyBridges(out.value.steps)).toEqual({ explained: 1, thin: 1, unexplained: 1, credit: 1.5 });
    }
  });

  it("drops a step for a word nobody said", () => {
    const out = acceptBridgeChain({ steps: [step("ink", "pens write with ink", "explained"), step("volcano", "lava", "explained")] }, segments);
    expect(out.ok && out.value.steps.map((s) => s.word)).toEqual(["ink"]);
  });

  it("gives at most half credit to a reason the speaker didn't say", () => {
    const out = acceptBridgeChain({ steps: [step("ink", "because pens are made with black ink", "explained")] }, segments);
    expect(out.ok && out.value.steps[0]).toMatchObject({ verdict: "thin", reason: "" });
  });

  it("refuses an empty answer for a long attempt", () => {
    expect(acceptBridgeChain({ steps: [] }, segments).ok).toBe(false);
    expect(acceptBridgeChain({ steps: [] }, bridgeSegments(tokens("ink"), [0], ["pen"])).ok).toBe(true);
  });
});

describe("scoring a judged Bridge Chain", () => {
  const setup = prepareDrill("chain_bridge", 1, 0, "pen"); // target 3
  const said = "ink because pens write with ink octopus because octopuses squirt ink sea because octopuses live there";
  const judged = (verdicts: ("explained" | "thin" | "unexplained")[]) => ({
    bridgeChainJudgement: { steps: verdicts.map((verdict, n) => ({ n: n + 1, word: "w", reason: "", verdict, note: "" })) },
  });

  it("passes three explained links", () => {
    const { outcome } = evaluateDrill(setup, { transcript: said, speakingMs: 30000, volume: [], seedWords: ["pen"], ...judged(["explained", "explained", "explained"]) });
    expect(outcome.success).toBe(true);
    expect(outcome.summary).toBe("3 explained (target 3)");
  });

  it("does not pass for saying 'because' with nothing after it", () => {
    const gamed = "ink because octopus because river because banana because";
    const counted = evaluateDrill(setup, { transcript: gamed, speakingMs: 30000, volume: [], seedWords: ["pen"] });
    expect(counted.outcome.success).toBe(true); // the phone can only count the word
    expect(counted.outcome.summary).toContain("counted, not checked");
    const checked = evaluateDrill(setup, { transcript: gamed, speakingMs: 30000, volume: [], seedWords: ["pen"], ...judged(["unexplained", "unexplained", "unexplained", "unexplained"]) });
    expect(checked.outcome.score).toBe(0);
    expect(checked.outcome.summary).toBe("0 explained, 4 with no reason (target 3)");
  });

  it("a vague reason counts half", () => {
    const { outcome } = evaluateDrill(setup, { transcript: said, speakingMs: 30000, volume: [], seedWords: ["pen"], ...judged(["explained", "thin", "thin", "thin"]) });
    expect(outcome.score).toBe(0.83); // 1 + 3 halves = 2.5 of 3
  });
});
