import { countRate, countReached } from "../breathCount";
import { paramsFor, scoreBreathCount } from "../drillSpecs";
import { prepareDrill } from "../prepareDrill";
import { evaluateDrill } from "../evaluateDrill";

const words = (s: string) => s.split(/\s+/);

describe("countReached", () => {
  it("reads counts as words, digits, or digits run together", () => {
    expect(countReached(words("one two three four five"))).toBe(5);
    expect(countReached(words("1 2 3 4 5 6 7"))).toBe(7);
    expect(countReached(words("12345 678910 11 12"))).toBe(12);
  });

  it("joins compound numbers past twenty", () => {
    const toTwenty = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty";
    expect(countReached(words(`${toTwenty} twenty one twenty two twenty-three`))).toBe(21 + 2);
    expect(countReached(words("eighteen nineteen twenty"))).toBe(0);
  });

  it("forgives one dropped number, and misheard small ones", () => {
    expect(countReached(words("1 2 3 5 6"))).toBe(6);
    expect(countReached(words("won to three for five six seven ate nine"))).toBe(9);
  });

  it("can't be inflated by jumping ahead or by other words", () => {
    expect(countReached(words("one two fifty"))).toBe(2);
    expect(countReached(words("one two um I need a breath three"))).toBe(3);
    expect(countReached(words("1 2 3 9 10 11"))).toBe(3);
    expect(countReached([])).toBe(0);
  });
});

describe("countRate", () => {
  it("is numbers a second, once there's enough to judge", () => {
    expect(countRate(20, 10_000)).toBe(2);
    expect(countRate(3, 1000)).toBeNull();
  });
});

describe("one-breath count drill", () => {
  it("asks for a longer count as the level rises", () => {
    expect(paramsFor("breath_count", 1).target).toBe(10);
    expect(paramsFor("breath_count", 10).target).toBe(28);
  });

  it("passes a full count at an easy pace, not a rushed one", () => {
    expect(scoreBreathCount(14, 12, 2).success).toBe(true);
    expect(scoreBreathCount(14, 12, 4.2).success).toBe(false);
    expect(scoreBreathCount(14, 12, 4.2).summary).toMatch(/rushed/);
    expect(scoreBreathCount(6, 12, 2).score).toBe(0.5);
  });

  it("scores from the transcript and how long you spoke", () => {
    const setup = prepareDrill("breath_count", 1, 0);
    expect(setup.live).toBe("breath");
    const { outcome, details } = evaluateDrill(setup, { transcript: "one two three four five six seven eight nine ten eleven twelve", speakingMs: 6000, volume: [] });
    expect(details.count).toBe(12);
    expect(details.perSecond).toBe(2);
    expect(outcome.success).toBe(true);
  });
});
