import { accuracyGate, chainGate, explainGate, keyWordsGate, readingGate, repetitionGate, replyGate, storyGate, takeGate, wordsHeardGate } from "../gates";
import { prepareDrill } from "../drills/prepareDrill";
import { evaluateDrill, type DrillMeasurements } from "../drills/evaluateDrill";
import { scorePace } from "../drills/drillSpecs";
import { prepareConversation } from "../conversation/prepareConversation";
import { evaluateConversation } from "../conversation/evaluateConversation";

// Plan 6.4, rule 2, and section 16's validity tests: no score without proof the
// task was done, and a gate that fails says why.

const measured = (transcript: string, extra: Partial<DrillMeasurements> = {}): DrillMeasurements => ({ transcript, speakingMs: 20000, volume: [], ...extra });

describe("the reading drills", () => {
  it("needs 70% of the words on Pace and Pause reading, 60% for a non-native speaker", () => {
    expect(readingGate(70).passed).toBe(true);
    expect(readingGate(69).passed).toBe(false);
    expect(readingGate(60, true).passed).toBe(true);
    expect(readingGate(59, true).passed).toBe(false);
    expect(readingGate(50)).toMatchObject({ passed: false, kind: "failed" });
  });

  it("can't score wrong words on pace alone: in band × accuracy", () => {
    const params = { wpmMin: 120, wpmMax: 170 } as never;
    expect(scorePace(140, 100, params).score).toBe(1);
    expect(scorePace(140, 30, params).score).toBe(0.3);
  });

  it("fails Pace reading for words that aren't on the screen", () => {
    const setup = prepareDrill("pace_reading", 3, 1);
    const wrong = evaluateDrill(setup, measured("completely different things about the weather and my lunch today"));
    expect(wrong.gate.passed).toBe(false);
    const right = evaluateDrill(setup, measured(setup.targetText!));
    expect(right.gate.passed).toBe(true);
    expect(right.outcome.score).toBeGreaterThan(wrong.outcome.score);
  });

  it("fails Shadowing and Minimal pairs for words that aren't the target", () => {
    expect(accuracyGate(39).passed).toBe(false);
    expect(accuracyGate(40).passed).toBe(true);
    const setup = prepareDrill("shadowing", 3, 1);
    expect(evaluateDrill(setup, measured("nothing like the model at all")).gate.passed).toBe(false);
    expect(evaluateDrill(setup, measured(setup.targetText!)).gate.passed).toBe(true);
  });
});

describe("the chains", () => {
  it("doesn't score a chain nothing checked, and says it wasn't your fault", () => {
    const verdict = chainGate(false);
    expect(verdict).toMatchObject({ passed: false, kind: "not_checked" });
    expect(chainGate(true).passed).toBe(true);
  });

  it("gives nonsense in Word chain no score", () => {
    const setup = prepareDrill("word_chain", 3, 1);
    expect(evaluateDrill(setup, measured("banana seventeen purple gravity ostrich tuesday")).gate).toMatchObject({ passed: false, kind: "not_checked" });
  });

  it("counts a chain Tono AI judged", () => {
    const setup = prepareDrill("word_chain", 3, 1);
    const judged = { links: [{ from: "a", to: "b", verdict: "clear" }] } as never;
    expect(evaluateDrill(setup, measured("a b", { wordChainJudgement: judged })).gate.passed).toBe(true);
  });

  it("gives an unchecked Bridge chain no score, for all its becauses", () => {
    const setup = prepareDrill("chain_bridge", 3, 1);
    expect(evaluateDrill(setup, measured("because because because because")).gate).toMatchObject({ passed: false, kind: "not_checked" });
  });
});

describe("the thinking drills", () => {
  it("fails a story with none of the words", () => {
    expect(storyGate(0).passed).toBe(false);
    expect(storyGate(1).passed).toBe(true);
    const setup = prepareDrill("random_word_story", 3, 1);
    expect(evaluateDrill(setup, measured("once upon a time something happened to someone somewhere")).gate.passed).toBe(false);
  });

  it("fails babble in Sixty seconds", () => {
    expect(repetitionGate("la la la la la la la la la la la la la la".split(" ")).passed).toBe(false);
    expect(repetitionGate("I went to the shops and then I came home to make a nice dinner for us".split(" ")).passed).toBe(true);
    expect(repetitionGate(["too", "short"]).passed).toBe(false);
    const setup = prepareDrill("just_a_minute", 3, 1);
    expect(evaluateDrill(setup, measured("blah blah blah blah blah blah blah blah blah blah blah blah blah blah")).gate.passed).toBe(false);
  });

  it("doesn't hold repeating against someone who stutters", () => {
    const setup = prepareDrill("just_a_minute", 3, 1);
    expect(evaluateDrill(setup, measured("I I I I I I I I I I I I I I I", { ignoreSlips: true })).gate.passed).toBe(true);
  });

  it("wants words on Projection, not just a shout", () => {
    expect(wordsHeardGate(0).passed).toBe(false);
    expect(wordsHeardGate(3).passed).toBe(true);
    const setup = prepareDrill("projection", 3, 1);
    expect(evaluateDrill(setup, measured("")).gate.passed).toBe(false);
  });

  it("wants key words on a Rolling summary, unless a judge read it", () => {
    expect(keyWordsGate(0, false).passed).toBe(false);
    expect(keyWordsGate(1, false).passed).toBe(true);
    expect(keyWordsGate(0, true).passed).toBe(true);
  });

  it("wants the key term on Explain it simply, or a judge's say", () => {
    expect(explainGate(false, false, false).passed).toBe(false);
    expect(explainGate(true, false, false).passed).toBe(true);
    expect(explainGate(false, false, true).passed).toBe(true);
    expect(explainGate(true, true, true).passed).toBe(false);
  });
});

describe("the conversation drills", () => {
  it("needs a reply of 3 or more words", () => {
    expect(replyGate(false).passed).toBe(false);
    const setup = prepareConversation("conv_reply", 1, 0, undefined);
    const turn = { transcript: "ok", partnerEndAt: 0, listenStartAt: 0, volume: [], firstResultAt: 100, lastResultAt: 200 } as never;
    expect(evaluateConversation(setup, setup.turns.map(() => turn)).gate.passed).toBe(false);
    const reply = { transcript: "that sounds really good", partnerEndAt: 0, listenStartAt: 0, volume: [], firstResultAt: 100, lastResultAt: 900 } as never;
    expect(evaluateConversation(setup, setup.turns.map(() => reply)).gate.passed).toBe(true);
  });
});

describe("a take", () => {
  it("needs enough words", () => {
    expect(takeGate({ kind: "impromptu", wordCount: 5, readAccuracyPercent: null }).passed).toBe(false);
    expect(takeGate({ kind: "impromptu", wordCount: 20, readAccuracyPercent: null }).passed).toBe(true);
  });

  it("rejects a wrong script: 80% of it read, 70% for a non-native speaker", () => {
    expect(takeGate({ kind: "script", wordCount: 100, readAccuracyPercent: 79 })).toMatchObject({ passed: false, kind: "failed" });
    expect(takeGate({ kind: "script", wordCount: 100, readAccuracyPercent: 80 }).passed).toBe(true);
    expect(takeGate({ kind: "script", wordCount: 100, readAccuracyPercent: 70, relaxed: true }).passed).toBe(true);
    expect(takeGate({ kind: "script", wordCount: 100, readAccuracyPercent: 69, relaxed: true }).passed).toBe(false);
  });

  it("says you keep your minutes", () => {
    const verdict = takeGate({ kind: "impromptu", wordCount: 1, readAccuracyPercent: null });
    expect(!verdict.passed && verdict.reason).toContain("You keep your minutes");
  });
});
