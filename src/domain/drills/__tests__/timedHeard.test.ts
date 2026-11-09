import { chainStartsFromTimes, pauseMarkPositions, pausesAtMarks, timedTokens, type TimedWordInput } from "../timedHeard";
import { buildTarget } from "../../speech/speechAlignment";
import { prepareDrill, stripPauseMarks } from "../prepareDrill";
import { evaluateDrill } from "../evaluateDrill";
import { PACE_PASSAGES } from "../../../content/drillContent";

// Whisper-like words for a passage: each word 300 ms, 60 ms apart, with an extra
// gap after the words whose index is in `gaps`.
function spoken(text: string, gaps: Record<number, number> = {}): TimedWordInput[] {
  const words = stripPauseMarks(text).split(/\s+/);
  let t = 500;
  return words.map((w, i) => {
    const startMs = t;
    const endMs = t + 300;
    t = endMs + 60 + (gaps[i] ?? 0);
    return { text: w, startMs, endMs };
  });
}

const coffee = PACE_PASSAGES.find((p) => p.id === "pace_coffee")!;

describe("pauseMarkPositions", () => {
  it("finds the word each mark follows", () => {
    expect(pauseMarkPositions("One two / three four // five six")).toEqual([1, 3]);
  });

  it("counts a hyphenated word as the parts the scorer will see", () => {
    expect(pauseMarkPositions("A well-known fact / is here")).toEqual([3]);
  });

  it("leaves out a mark with nothing after it, and a doubled one", () => {
    expect(pauseMarkPositions("One two / / three /")).toEqual([1]);
  });

  it("agrees with the passage's own mark count", () => {
    const setup = prepareDrill("pause_reading", 1, 1, "pace_coffee");
    expect(setup.pauseAfter).toHaveLength(setup.pauseMarks!);
  });
});

describe("timedTokens", () => {
  it("drops fillers like the scorers do and keeps the others' times", () => {
    const tokens = timedTokens([
      { text: "Um,", startMs: 0, endMs: 200 },
      { text: "Hello,", startMs: 300, endMs: 700 },
      { text: "world.", startMs: 800, endMs: 1200 },
    ]);
    expect(tokens.map((t) => [t.norm, t.startMs])).toEqual([["hello", 300], ["world", 800]]);
  });

  it("shares a split word's times across its parts", () => {
    const tokens = timedTokens([{ text: "one-one", startMs: 100, endMs: 500 }]);
    expect(tokens.map((t) => t.norm)).toEqual(["one", "one"]);
    expect(tokens.every((t) => t.startMs === 100)).toBe(true);
  });
});

describe("chainStartsFromTimes", () => {
  const tokens = timedTokens([
    { text: "dog", startMs: 500, endMs: 800 },
    { text: "bone", startMs: 900, endMs: 1200 },
    { text: "sky", startMs: 6000, endMs: 6300 },
    { text: "blue", startMs: 6400, endMs: 6700 },
  ]);

  it("starts each run at the first word spoken after its start word appeared", () => {
    expect(chainStartsFromTimes(tokens, [0, 5000])).toEqual([0, 2]);
  });

  it("puts a start word that nothing followed at the end", () => {
    expect(chainStartsFromTimes(tokens, [0, 9000])).toEqual([0, 4]);
  });
});

describe("pausesAtMarks", () => {
  const setup = prepareDrill("pause_reading", 1, 1, "pace_coffee");
  const target = buildTarget(setup.targetText!);
  const after = setup.pauseAfter!;

  it("counts a pause held at every mark", () => {
    const gaps = Object.fromEntries(after.map((i) => [i, 700]));
    const r = pausesAtMarks(target, timedTokens(spoken(coffee.text, gaps)), after, 400);
    expect(r).toEqual({ marks: after.length, held: after.length });
  });

  it("counts none when the passage is read straight through", () => {
    expect(pausesAtMarks(target, timedTokens(spoken(coffee.text)), after, 400).held).toBe(0);
  });

  it("does not count pauses away from the marks (the section 16 validity test)", () => {
    // Long pauses after words that are not marks.
    const notMarks = [0, 5, 12, 20, 25].filter((i) => !after.includes(i));
    const gaps = Object.fromEntries(notMarks.map((i) => [i, 900]));
    expect(pausesAtMarks(target, timedTokens(spoken(coffee.text, gaps)), after, 400).held).toBe(0);
  });

  it("needs the pause to be as long as the drill asks", () => {
    const gaps = Object.fromEntries(after.map((i) => [i, 250]));
    expect(pausesAtMarks(target, timedTokens(spoken(coffee.text, gaps)), after, 400).held).toBe(0);
    expect(pausesAtMarks(target, timedTokens(spoken(coffee.text, gaps)), after, 200).held).toBe(after.length);
  });

  it("does not count a mark whose words were not read", () => {
    const words = spoken(coffee.text, Object.fromEntries(after.map((i) => [i, 700])));
    const withoutFirstSentence = words.slice(after[0] + 1);
    const r = pausesAtMarks(target, timedTokens(withoutFirstSentence), after, 400);
    expect(r.held).toBeLessThan(after.length);
  });
});

describe("Pause reading, scored from Whisper's word times", () => {
  const setup = prepareDrill("pause_reading", 1, 1, "pace_coffee");
  const after = setup.pauseAfter!;
  const volume = [{ tMs: 0, value: 5 }];

  it("scores the pauses held at the marks", () => {
    const words = spoken(coffee.text, Object.fromEntries(after.map((i) => [i, 700])));
    const { details, outcome, gate } = evaluateDrill(setup, { transcript: stripPauseMarks(coffee.text), speakingMs: 20000, volume, words });
    expect(details.pauses).toBe(after.length);
    expect(outcome.score).toBeGreaterThan(0.9);
    expect(gate.passed).toBe(true);
  });

  it("gives long pauses in the wrong places no credit", () => {
    const wrong = [2, 8, 15, 22, 30].filter((i) => !after.includes(i));
    const words = spoken(coffee.text, Object.fromEntries(wrong.map((i) => [i, 900])));
    const { details, outcome } = evaluateDrill(setup, { transcript: stripPauseMarks(coffee.text), speakingMs: 20000, volume, words });
    expect(details.pauses).toBe(0);
    expect(outcome.score).toBe(0);
  });

  it("falls back to counting pauses anywhere without word times", () => {
    const silence = Array.from({ length: 10 }, (_, i) => ({ tMs: 2000 + i * 100, value: -1 }));
    const speech = (from: number, to: number) => Array.from({ length: (to - from) / 100 }, (_, i) => ({ tMs: from + i * 100, value: 5 }));
    const { details } = evaluateDrill(setup, { transcript: stripPauseMarks(coffee.text), speakingMs: 5000, volume: [...speech(0, 2000), ...silence, ...speech(3000, 5000)] });
    expect(details.pauses).toBe(1);
  });
});
