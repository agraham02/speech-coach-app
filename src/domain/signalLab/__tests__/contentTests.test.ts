import { CONTENT_TESTS } from "../contentTests";
import { TOPIC_GOLD, WORD_CHAIN_LINKS } from "../../meaning/gold";
import type { StepMeasures } from "../types";

const entry = (id: string) => CONTENT_TESTS.find((t) => t.def.id === id)!;
const run = (meaning: NonNullable<StepMeasures["run"]>["meaning"]): StepMeasures => ({ run: { stepId: "run", durationMs: 0, meaning } });

const links = (good: number, broken: number) => WORD_CHAIN_LINKS.map((l, i) => (l.gold === "none" ? broken : good) + (i % 2 ? 0.02 : -0.02));

describe("the word links test", () => {
  it("passes a phone that separates good links from broken ones", () => {
    const outcome = entry("content.word_links").evaluate(run({ linkSims: links(0.6, 0.1) }));
    expect(outcome.pass).toBe(true);
    expect(outcome.numbers.catchRate).toBe(1);
  });

  it("fails one that calls every pair a link, and says what stays", () => {
    const outcome = entry("content.word_links").evaluate(run({ linkSims: links(0.6, 0.6) }));
    expect(outcome.pass).toBe(false);
    expect(outcome.summary).toContain("Tono AI");
  });

  it("says nothing without a run", () => {
    expect(entry("content.word_links").evaluate({}).pass).toBeNull();
    expect(entry("content.word_links").evaluate(run({ linkSims: [0.5] })).pass).toBeNull();
  });
});

describe("the on topic test", () => {
  const readings = (on: number, off: number, gibberishCoherence: number) =>
    TOPIC_GOLD.map((c, i) => ({
      onTopic: (c.kind === "on" ? on : off) + (i % 3) * 0.01,
      coherence: c.kind === "gibberish" ? gibberishCoherence : 0.6 + (i % 3) * 0.01,
    }));

  it("passes when real answers sit clear above off-topic ones and nonsense", () => {
    const outcome = entry("content.on_topic").evaluate(run({ topicReadings: readings(0.7, 0.2, 0.1) }));
    expect(outcome.pass).toBe(true);
    expect(outcome.numbers.flaggedReal).toBe(0);
  });

  it("fails when they overlap", () => {
    expect(entry("content.on_topic").evaluate(run({ topicReadings: readings(0.5, 0.48, 0.1) })).pass).toBe(false);
  });

  it("fails when the line would flag a real answer", () => {
    // One real answer reads low, but the groups still separate on average.
    const r = readings(0.7, 0.2, 0.1);
    r[0] = { onTopic: 0.1, coherence: 0.6 };
    const outcome = entry("content.on_topic").evaluate(run({ topicReadings: r }));
    expect(outcome.pass).toBe(false);
  });

  it("says nothing without a run", () => {
    expect(entry("content.on_topic").evaluate({}).pass).toBeNull();
  });
});

describe("the judge test", () => {
  it("still waits for the hosted eval", () => {
    expect(entry("content.judge").def.blockedBy).toBeTruthy();
  });
});
