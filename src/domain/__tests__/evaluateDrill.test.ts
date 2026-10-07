import { evaluateDrill } from "../drills/evaluateDrill";
import { prepareDrill } from "../drills/prepareDrill";

const silence = (fromMs: number, toMs: number) =>
  Array.from({ length: (toMs - fromMs) / 100 }, (_, i) => ({ tMs: fromMs + i * 100, value: -1 }));
const speech = (fromMs: number, toMs: number, value = 5) =>
  Array.from({ length: (toMs - fromMs) / 100 }, (_, i) => ({ tMs: fromMs + i * 100, value }));

describe("evaluateDrill", () => {
  it("scores a pace reading by wpm and accuracy", () => {
    const setup = prepareDrill("pace_reading", 2, 1, "pace_coffee");
    const words = setup.targetText!.split(/\s+/).length;
    const speakingMs = (words / 145) * 60000;
    const { outcome, details } = evaluateDrill(setup, { transcript: setup.targetText!, speakingMs, volume: [] });
    expect(details.accuracyPercent).toBe(100);
    expect(outcome.success).toBe(true);
  });

  it("counts held pauses in a pause reading", () => {
    const setup = prepareDrill("pause_reading", 1, 1, "pace_coffee");
    const volume = [...speech(0, 2000), ...silence(2000, 2700), ...speech(2700, 4000), ...silence(4000, 4100), ...speech(4100, 5000)];
    const { details } = evaluateDrill(setup, { transcript: setup.targetText!, speakingMs: 5000, volume });
    expect(details.pauses).toBe(1);
  });

  it("counts unique fluency words for a letter", () => {
    const setup = prepareDrill("letter_fluency", 1, 0, "s");
    const { details, outcome } = evaluateDrill(setup, { transcript: "sun star um sand sun stone moon", speakingMs: 0, volume: [] });
    expect(details.counted).toEqual(["sun", "star", "sand", "stone"]);
    expect(outcome.success).toBe(false); // target is 6 at level 1
  });

  it("checks story words", () => {
    const setup = { ...prepareDrill("random_word_story", 1, 2), words: ["lemon", "bridge"] };
    const { details } = evaluateDrill(setup, { transcript: "I took two lemons over the old bridge", speakingMs: 20000, volume: speech(0, 25000) });
    expect(details.missingWords).toEqual([]);
  });

  it("counts long hesitations in Just a Minute", () => {
    const setup = prepareDrill("just_a_minute", 1, 0);
    const volume = [...speech(0, 10000), ...silence(10000, 12500), ...speech(12500, 34000)];
    const { details } = evaluateDrill(setup, { transcript: "um well it is nice", speakingMs: 34000, volume });
    expect(details.hesitations).toBe(1);
    expect(details.fillers).toBe(1);
  });

  it("measures projection", () => {
    const setup = prepareDrill("projection", 1, 0);
    const volume = [...speech(0, 4000, 6), ...speech(4000, 5000, 1)];
    const { details } = evaluateDrill(setup, { transcript: "", speakingMs: 5000, volume });
    expect(details.fractionAtTarget).toBe(0.8);
  });
});
