import {
  canTellDay,
  decideRewindOffer,
  detectRewindWindow,
  halfOfDay,
  resolveRewindWindow,
  rewindAboutDay,
  rewindWords,
  type RewindWindow,
} from "../rewind/rewindTiming";

// Made-up dates: Thursday 12 November 2026 is "today".
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute);
const iso = (d: Date) => d.toISOString();
const TODAY = "2026-11-12";
const YESTERDAY = "2026-11-11";

describe("which day Rewind offers", () => {
  it("offers today in the evening", () => {
    expect(decideRewindOffer({ now: at(12, 18), window: "evening", toldDates: [] })).toEqual({ date: TODAY, day: "today" });
    expect(decideRewindOffer({ now: at(12, 23, 30), window: "evening", toldDates: [YESTERDAY] })).toEqual({ date: TODAY, day: "today" });
  });

  it("offers yesterday in the morning and at midday, when it was not told", () => {
    for (const hour of [5, 8, 11, 12, 14, 17]) {
      expect(decideRewindOffer({ now: at(12, hour), window: "morning", toldDates: [] })).toEqual({ date: YESTERDAY, day: "yesterday" });
      expect(decideRewindOffer({ now: at(12, hour), window: "evening", toldDates: [] })).toEqual({ date: YESTERDAY, day: "yesterday" });
    }
  });

  it("each day is told once", () => {
    expect(decideRewindOffer({ now: at(12, 8), window: "morning", toldDates: [YESTERDAY] })).toBeNull();
    expect(decideRewindOffer({ now: at(12, 21), window: "evening", toldDates: [TODAY] })).toBeNull();
    // Telling yesterday earlier doesn't unlock anything else in the evening.
    expect(decideRewindOffer({ now: at(12, 21), window: "evening", toldDates: [TODAY, YESTERDAY] })).toBeNull();
  });

  it("never offers a day older than yesterday", () => {
    // Nothing told for a week: only yesterday comes up, not the days before.
    const offer = decideRewindOffer({ now: at(12, 9), window: "morning", toldDates: ["2026-11-05"] });
    expect(offer?.date).toBe(YESTERDAY);
    expect(decideRewindOffer({ now: at(12, 9), window: "morning", toldDates: [YESTERDAY, "2026-11-05"] })).toBeNull();
  });

  it("a morning person is not asked to tell the same day again that night", () => {
    expect(decideRewindOffer({ now: at(12, 21), window: "morning", toldDates: [] })).toBeNull();
    // ...and tomorrow morning, today becomes yesterday and is offered.
    expect(decideRewindOffer({ now: at(13, 8), window: "morning", toldDates: [] })).toEqual({ date: TODAY, day: "yesterday" });
  });

  it("follows the evening hour it is given", () => {
    expect(decideRewindOffer({ now: at(12, 19), window: "evening", toldDates: [], eveningFromHour: 20 })?.day).toBe("yesterday");
    expect(decideRewindOffer({ now: at(12, 20), window: "evening", toldDates: [], eveningFromHour: 20 })?.day).toBe("today");
  });

  it("crosses a month and a year", () => {
    expect(decideRewindOffer({ now: new Date(2027, 0, 1, 9), window: "morning", toldDates: [] })?.date).toBe("2026-12-31");
    expect(decideRewindOffer({ now: new Date(2026, 2, 1, 9), window: "morning", toldDates: [] })?.date).toBe("2026-02-28");
  });

  it("can tell whether a requested day is still open", () => {
    expect(canTellDay("yesterday", at(12, 9), [])).toBe(true);
    expect(canTellDay("yesterday", at(12, 9), [YESTERDAY])).toBe(false);
    expect(canTellDay("today", at(12, 9), [YESTERDAY])).toBe(true);
    expect(canTellDay("today", at(12, 9), [TODAY])).toBe(false);
  });
});

describe("when you practise", () => {
  const now = at(12, 22);

  // One entry per (days back, hour).
  const log = (...entries: [number, number][]) => entries.map(([back, hour]) => iso(at(12 - back, hour, 10)));

  it("splits the day at 4, noon and 5 pm", () => {
    expect(halfOfDay(3)).toBe("evening");
    expect(halfOfDay(4)).toBe("morning");
    expect(halfOfDay(11)).toBe("morning");
    expect(halfOfDay(12)).toBe("midday");
    expect(halfOfDay(16)).toBe("midday");
    expect(halfOfDay(17)).toBe("evening");
    expect(halfOfDay(23)).toBe("evening");
  });

  it("calls someone who practises before noon a morning person", () => {
    expect(detectRewindWindow(log([1, 7], [2, 8], [3, 7], [4, 9], [5, 8], [7, 7]), now)).toBe("morning");
  });

  it("calls someone who practises at night an evening person", () => {
    expect(detectRewindWindow(log([1, 20], [2, 21], [3, 19], [4, 22], [5, 20], [6, 23]), now)).toBe("evening");
  });

  it("a mixed habit goes with the larger share, and ties go to the evening", () => {
    expect(detectRewindWindow(log([1, 7], [2, 8], [3, 7], [4, 8], [5, 20]), now)).toBe("morning"); // 4 of 5
    expect(detectRewindWindow(log([1, 7], [2, 8], [3, 20], [4, 21]), now)).toBe("evening"); // 2 of 4
    expect(detectRewindWindow(log([1, 7], [2, 8], [3, 9], [4, 20], [5, 21]), now)).toBe("morning"); // 3 of 5 is 60%
  });

  it("falls back to the evening with too little data", () => {
    expect(detectRewindWindow([], now)).toBe("evening");
    expect(detectRewindWindow(log([1, 7], [2, 8], [3, 7]), now)).toBe("evening");
  });

  it("counts a busy morning once, not once per activity", () => {
    const busy = [7, 8, 8, 9, 7].map((h) => iso(at(11, h, 5)));
    expect(detectRewindWindow(busy, now)).toBe("evening"); // one morning is too little data
  });

  it("ignores midday, anything older than 14 days and bad data", () => {
    expect(detectRewindWindow(log([1, 13], [2, 14], [3, 15], [4, 13], [5, 14]), now)).toBe("evening");
    const old = [20, 21, 22, 23, 24].map((d) => iso(new Date(2026, 9, d, 8)));
    expect(detectRewindWindow(old, now)).toBe("evening");
    // The 14th day back (30 October) still counts.
    const edge = [30, 31].map((d, i) => iso(new Date(2026, 9, d, 8, i)));
    const more = [1, 2, 3].map((d) => iso(new Date(2026, 10, d, 8)));
    expect(detectRewindWindow([...edge, ...more], now)).toBe("morning");
    expect(detectRewindWindow(["not a date", ...log([1, 7], [2, 8], [3, 7])], now)).toBe("evening");
  });

  it("after midnight counts as the evening before", () => {
    const times = [11, 10, 9, 8].map((d) => iso(at(d, 1, 30)));
    expect(detectRewindWindow(times, now)).toBe("evening");
  });

  it("the setting overrides the habit", () => {
    const morningHabit = log([1, 7], [2, 8], [3, 7], [4, 9]);
    const resolve = (setting: "auto" | "morning" | "evening"): RewindWindow => resolveRewindWindow(setting, morningHabit, now);
    expect(resolve("auto")).toBe("morning");
    expect(resolve("evening")).toBe("evening");
    expect(resolveRewindWindow("morning", [], now)).toBe("morning");
    expect(resolveRewindWindow("auto", [], now)).toBe("evening");
  });
});

describe("the words for yesterday", () => {
  it("says which day a take is about", () => {
    expect(rewindAboutDay(TODAY, iso(at(12, 21)))).toBe("today");
    expect(rewindAboutDay(YESTERDAY, iso(at(12, 8)))).toBe("yesterday");
    expect(rewindAboutDay(TODAY, "garbage")).toBe("today");
  });

  it("puts the cues and titles in the past tense", () => {
    const words = rewindWords("yesterday");
    expect(words.title).toBe("Tell me about yesterday");
    expect(words.cues.morning).toBe("Yesterday morning");
    expect(words.cues.evening).toBe("Yesterday evening");
    expect(rewindWords("today").cues.morning).toBe("Morning");
    expect(rewindWords("today").title).toBe("Tell me about your day");
  });
});
