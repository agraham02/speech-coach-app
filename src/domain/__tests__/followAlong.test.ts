import {
  activeWordIndex,
  atEnd,
  clampMs,
  formatClock,
  hasUsableTimings,
  msAtX,
  nextRate,
  seekTargetForWord,
  spokenClock,
} from "../playback/followAlong";

const words = [
  { text: "So", startMs: 0, endMs: 200 },
  { text: "um,", startMs: 300, endMs: 600 },
  { text: "today", startMs: 1500, endMs: 1900 },
  { text: "I", startMs: 2000, endMs: 2100 },
];

describe("activeWordIndex", () => {
  it("is -1 before the first word", () => {
    expect(activeWordIndex([{ text: "a", startMs: 500, endMs: 800 }], 100)).toBe(-1);
    expect(activeWordIndex([], 100)).toBe(-1);
  });
  it("finds the word being said", () => {
    expect(activeWordIndex(words, 0)).toBe(0);
    expect(activeWordIndex(words, 350)).toBe(1);
    expect(activeWordIndex(words, 2050)).toBe(3);
  });
  it("rests on the last word said through a pause", () => {
    expect(activeWordIndex(words, 1200)).toBe(1);
  });
  it("stays on the last word after the end", () => {
    expect(activeWordIndex(words, 99_000)).toBe(3);
  });
  it("is fast on a long take", () => {
    const long = Array.from({ length: 5000 }, (_, i) => ({ text: "w", startMs: i * 300, endMs: i * 300 + 250 }));
    expect(activeWordIndex(long, 300 * 4321 + 10)).toBe(4321);
  });
});

describe("hasUsableTimings", () => {
  it("rejects missing or empty words", () => {
    expect(hasUsableTimings(null)).toBe(false);
    expect(hasUsableTimings([])).toBe(false);
  });
  it("accepts forward timings", () => {
    expect(hasUsableTimings(words, 3000)).toBe(true);
  });
  it("rejects timings that belong to other audio", () => {
    expect(hasUsableTimings([{ text: "a", startMs: 90_000, endMs: 90_500 }], 10_000)).toBe(false);
  });
  it("rejects all-zero timings", () => {
    expect(hasUsableTimings([{ text: "a", startMs: 0, endMs: 0 }, { text: "b", startMs: 0, endMs: 0 }])).toBe(false);
  });
  it("tolerates a token out of order but not a shuffle", () => {
    const one = [...words.slice(0, 3), { text: "x", startMs: 1400, endMs: 1450 }, ...words.slice(3)];
    expect(hasUsableTimings(one)).toBe(true);
    const shuffled = [5, 1, 4, 0, 3, 2, 6, 1].map((n, i) => ({ text: String(i), startMs: n * 100, endMs: n * 100 + 50 }));
    expect(hasUsableTimings(shuffled)).toBe(false);
  });
});

describe("seeking", () => {
  it("starts a tapped word a moment early, never before zero", () => {
    expect(seekTargetForWord(words[2])).toBe(1380);
    expect(seekTargetForWord(words[0])).toBe(0);
  });
  it("maps a finger to a time inside the take", () => {
    expect(msAtX(50, 200, 120_000)).toBe(30_000);
    expect(msAtX(-10, 200, 120_000)).toBe(0);
    expect(msAtX(400, 200, 120_000)).toBe(120_000);
    expect(msAtX(10, 0, 120_000)).toBe(0);
  });
  it("clamps", () => {
    expect(clampMs(NaN, 1000)).toBe(0);
    expect(clampMs(2000, 1000)).toBe(1000);
  });
  it("knows when it's played to the end", () => {
    expect(atEnd(119_900, 120_000)).toBe(true);
    expect(atEnd(60_000, 120_000)).toBe(false);
    expect(atEnd(0, 0)).toBe(false);
  });
});

describe("labels", () => {
  it("formats the clock", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65_400)).toBe("1:05");
    expect(formatClock(-5)).toBe("0:00");
  });
  it("speaks the clock", () => {
    expect(spokenClock(65_000)).toBe("1 minute 5 seconds");
    expect(spokenClock(120_000)).toBe("2 minutes");
    expect(spokenClock(1000)).toBe("1 second");
    expect(spokenClock(0)).toBe("0 seconds");
  });
  it("cycles speeds back to normal", () => {
    expect(nextRate(1)).toBe(1.25);
    expect(nextRate(1.5)).toBe(0.75);
    expect(nextRate(0.75)).toBe(1);
    expect(nextRate(3)).toBe(1);
  });
});
