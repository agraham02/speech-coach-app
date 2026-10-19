import {
  deadlineFor,
  extendDeadline,
  mmss,
  prepUsedFrom,
  remainingSeconds,
  researchHelps,
  RESEARCH_MAX_SECONDS,
  searchUrl,
  startResearch,
} from "../prepTimer";
import { prepSentence } from "../promptTask";

const NOW = 1_000_000;

describe("the prep clock", () => {
  it("counts down against the wall clock, so time passes while you're in another app", () => {
    const deadline = deadlineFor(NOW, 90);
    expect(remainingSeconds(deadline, NOW)).toBe(90);
    // Back from a two-minute search: the time is gone, not frozen.
    expect(remainingSeconds(deadline, NOW + 120_000)).toBe(0);
    expect(remainingSeconds(deadline, NOW + 30_500)).toBe(60);
  });

  it("adds 30 seconds, never more than five minutes from now", () => {
    expect(remainingSeconds(extendDeadline(deadlineFor(NOW, 20), NOW), NOW)).toBe(50);
    expect(remainingSeconds(extendDeadline(deadlineFor(NOW, 290), NOW), NOW)).toBe(RESEARCH_MAX_SECONDS);
    // Extending after time's up starts from now, not from the past.
    expect(remainingSeconds(extendDeadline(deadlineFor(NOW - 50_000, 10), NOW), NOW)).toBe(30);
  });

  it("makes research at least a minute, and leaves a longer window alone", () => {
    expect(remainingSeconds(startResearch(deadlineFor(NOW, 12), NOW), NOW)).toBe(60);
    expect(remainingSeconds(startResearch(deadlineFor(NOW, 120), NOW), NOW)).toBe(120);
  });

  it("formats minutes and seconds", () => {
    expect(mmss(272)).toBe("4:32");
    expect(mmss(9)).toBe("0:09");
  });
});

describe("what counts as preparation", () => {
  it("ignores a tap on Start right after the countdown opened", () => {
    expect(prepUsedFrom({ startedMs: NOW, endedMs: NOW + 2000, researched: false }).seconds).toBe(0);
    expect(prepUsedFrom({ startedMs: null, endedMs: NOW, researched: false }).seconds).toBe(0);
  });

  it("records the time, the notes and whether they were looked up", () => {
    const used = prepUsedFrom({ startedMs: NOW, endedMs: NOW + 150_000, researched: true, notes: "  point: x ", searched: true, notesOnScreen: true });
    expect(used).toEqual({ seconds: 150, researched: true, notes: "point: x", searched: true, notesOnScreen: true });
  });

  it("is only research with time behind it, and only has notes on screen if there are notes", () => {
    const none = prepUsedFrom({ startedMs: NOW, endedMs: NOW + 1000, researched: true, notesOnScreen: true });
    expect(none.researched).toBe(false);
    expect(none.notesOnScreen).toBeUndefined();
  });

  it("reads back to the reviewer correctly", () => {
    expect(prepSentence(prepUsedFrom({ startedMs: NOW, endedMs: NOW, researched: false }))).toMatch(/cold start/);
    expect(prepSentence(prepUsedFrom({ startedMs: NOW, endedMs: NOW + 30_000, researched: false }))).toMatch(/30 seconds to think/);
    expect(prepSentence(prepUsedFrom({ startedMs: NOW, endedMs: NOW + 240_000, researched: true }))).toMatch(/4 minutes to research/);
  });
});

describe("research helpers", () => {
  it("suggests research for explain and debate prompts", () => {
    expect(researchHelps({ category: "Explain" })).toBe(true);
    expect(researchHelps({ category: "Debate" })).toBe(true);
    expect(researchHelps({ category: "Story" })).toBe(false);
  });

  it("searches for the prompt itself, minus the framing", () => {
    expect(searchUrl("Explain why the moon has phases.")).toBe("https://www.google.com/search?q=Explain%20why%20the%20moon%20has%20phases.");
    expect(decodeURIComponent(searchUrl("Closing only: wrap up a meeting about an offsite. Make up the details."))).not.toMatch(/Closing only|Make up/);
  });
});

describe("research and mastery", () => {
  it("counts a researched take for less toward the impromptu skill, but still counts it", () => {
    const { RESEARCH_IMPROMPTU_WEIGHT } = jest.requireActual("../prepTimer");
    expect(RESEARCH_IMPROMPTU_WEIGHT).toBeGreaterThan(0);
    expect(RESEARCH_IMPROMPTU_WEIGHT).toBeLessThan(1);
  });
});
