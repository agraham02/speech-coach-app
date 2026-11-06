import { CLARITY_TESTS, COMPARE_PASSAGE, FILLER_SCRIPT } from "../clarityTests";
import { CONTENT_TESTS } from "../contentTests";
import { LAB_TESTS } from "../registry";
import { READINGS } from "../readingTrust";
import type { StepMeasure, StepMeasures } from "../types";

const entry = (id: string) => CLARITY_TESTS.find((t) => t.def.id === id)!;
const engine = (text: string, ms = 3000) => ({ text, words: null, ms });
const measure = (stepId: string, engines: StepMeasure["engines"], durationMs = 30_000): StepMeasures => ({ [stepId]: { stepId, durationMs, engines } });

// The script with N of its ten fillers dropped, as a transcriber might.
function dropFillers(text: string, keep: number): string {
  let seen = 0;
  return text
    .split(/(\b[Uu][mh]\b,?)/)
    .map((piece) => (/^[Uu][mh]\b/.test(piece) ? (++seen <= keep ? piece : "") : piece))
    .join("");
}

describe("the fillers test", () => {
  it("passes when Whisper keeps nine or ten of the ten", () => {
    expect(entry("clarity.fillers").evaluate(measure("read", { "turbo-prompted": engine(FILLER_SCRIPT), system: engine(dropFillers(FILLER_SCRIPT, 2)) })).pass).toBe(true);
    expect(entry("clarity.fillers").evaluate(measure("read", { "turbo-prompted": engine(dropFillers(FILLER_SCRIPT, 9)) })).pass).toBe(true);
  });

  it("fails when Whisper drops most of them, and reports the other engines", () => {
    const out = entry("clarity.fillers").evaluate(measure("read", { "turbo-prompted": engine(dropFillers(FILLER_SCRIPT, 3)), system: engine(FILLER_SCRIPT) }));
    expect(out.pass).toBe(false);
    expect(out.numbers.kept).toBe(3);
    expect(out.numbers.kept_system).toBe(10);
  });

  it("says nothing without the app's transcriber", () => {
    expect(entry("clarity.fillers").evaluate({}).pass).toBeNull();
    expect(entry("clarity.fillers").evaluate(measure("read", { system: engine(FILLER_SCRIPT) })).pass).toBeNull();
  });
});

describe("the recognizer vs Whisper test", () => {
  it("reports each engine's word errors and which is better", () => {
    const out = entry("clarity.recognizer_vs_whisper").evaluate(measure("read", { "turbo-prompted": engine(COMPARE_PASSAGE), system: engine("the library opens at nine and closes at 6 on week days") }));
    expect(out.pass).toBe(true);
    expect(out.numbers.wer_system as number).toBeGreaterThan(out.numbers["wer_turbo-prompted"] as number);
    expect(out.summary).toMatch(/fewer word errors/);
  });

  it("needs both engines to decide, and some transcription to say anything", () => {
    expect(entry("clarity.recognizer_vs_whisper").evaluate(measure("read", { "turbo-prompted": engine(COMPARE_PASSAGE) })).pass).toBeNull();
    expect(entry("clarity.recognizer_vs_whisper").evaluate({}).pass).toBeNull();
  });
});

describe("the Whisper speed test", () => {
  it("passes at ten seconds or less for a 30 s clip, scaled to the clip's length", () => {
    expect(entry("clarity.whisper_speed").evaluate(measure("clip", { "turbo-prompted": engine("x", 6000) }, 30_000)).pass).toBe(true);
    // 20 s in 8 s is 12 s for 30 s.
    expect(entry("clarity.whisper_speed").evaluate(measure("clip", { "turbo-prompted": engine("x", 8000) }, 20_000)).pass).toBe(false);
    expect(entry("clarity.whisper_speed").evaluate(measure("clip", { "turbo-prompted": engine("x", 8000) }, 40_000)).pass).toBe(true);
  });

  it("won't time a very short clip or a missing run", () => {
    expect(entry("clarity.whisper_speed").evaluate(measure("clip", { "turbo-prompted": engine("x", 1000) }, 8000)).pass).toBeNull();
    expect(entry("clarity.whisper_speed").evaluate({}).pass).toBeNull();
  });
});

describe("the content tests and the whole lab", () => {
  it("are listed, blocked, and say what they wait for", () => {
    expect(CONTENT_TESTS.map((t) => t.def.id)).toEqual(["content.word_links", "content.on_topic", "content.judge"]);
    for (const t of CONTENT_TESTS) {
      expect(t.def.blockedBy).toBeTruthy();
      expect(t.evaluate({}).pass).toBeNull();
    }
  });

  it("has every test that gates a reading, with unique ids", () => {
    const ids = LAB_TESTS.map((t) => t.def.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const reading of Object.values(READINGS)) for (const testId of reading.tests) expect(ids).toContain(testId);
  });

  it("gives every runnable step something to do and a place to record", () => {
    for (const { def } of LAB_TESTS) {
      if (def.blockedBy) continue;
      expect(def.steps.length).toBeGreaterThan(0);
      for (const step of def.steps) {
        expect(step.seconds).toBeGreaterThan(0);
        expect(step.instruction.length).toBeGreaterThan(5);
      }
    }
  });
});
