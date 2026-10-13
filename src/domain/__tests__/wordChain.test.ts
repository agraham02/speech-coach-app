import { chainWords, countBridges, nextSeed } from "../drills/wordChain";
import { evaluateDrill } from "../drills/evaluateDrill";
import { prepareDrill } from "../drills/prepareDrill";
import { paramsFor, scoreChain } from "../drills/drillSpecs";

describe("word chain", () => {
  it("keeps the chain in order and drops the seed word, fillers and repeats", () => {
    expect(chainWords("pen um ink Octopus ink the aquarium pens".split(" "), ["pen"])).toEqual(["ink", "octopus", "aquarium"]);
  });

  it("drops every seed shown after a fresh start", () => {
    expect(chainWords("ink octopus rain umbrella".split(" "), ["pen", "rain"])).toEqual(["ink", "octopus", "umbrella"]);
  });

  it("counts explained links, not filler 'so' or 'like'", () => {
    expect(countBridges("pen ink because pens need ink so like octopus cause they squirt ink")).toBe(2);
    expect(countBridges("ocean reminds me of salt which means chips")).toBe(2);
  });

  it("picks an unused seed after a blank", () => {
    expect(nextSeed(["a", "b", "c"], ["a", "b"], 0)).toBe("c");
    expect(nextSeed(["a", "b", "c"], ["a"], 0)).toBe("b");
  });

  it("gets harder with level: more links, less grace", () => {
    const easy = paramsFor("word_chain", 1);
    const hard = paramsFor("word_chain", 10);
    expect(easy.target).toBe(8);
    expect(hard.target).toBe(25);
    expect(hard.stallSeconds!).toBeLessThan(easy.stallSeconds!);
    expect(hard.seconds!).toBeGreaterThan(easy.seconds!);
  });

  it("only charges for fresh starts after the first, and never when told not to", () => {
    expect(scoreChain(8, 8, 1).score).toBe(1);
    expect(scoreChain(8, 8, 3).score).toBe(0.9);
    expect(scoreChain(8, 8, 3, false).score).toBe(1);
  });

  it("scores a chain attempt end to end", () => {
    const setup = prepareDrill("word_chain", 1, 0, "pen");
    expect(setup.live).toBe("chain");
    const transcript = "ink octopus aquarium fish water ocean boat sail wind";
    const { outcome, details } = evaluateDrill(setup, { transcript, speakingMs: 20000, volume: [], seedWords: ["pen"] });
    expect(details.counted).toHaveLength(9);
    expect(details.resets).toBe(0);
    expect(outcome.success).toBe(true);
  });

  it("scores a bridge chain by explained links", () => {
    const setup = prepareDrill("chain_bridge", 1, 0, "pen");
    const transcript = "ink because pens need ink octopus because they squirt ink sea since octopuses live there";
    const { details, outcome } = evaluateDrill(setup, { transcript, speakingMs: 30000, volume: [], seedWords: ["pen"] });
    expect(details.bridges).toBe(3);
    expect(outcome.success).toBe(true); // target is 3 at level 1
  });
});
