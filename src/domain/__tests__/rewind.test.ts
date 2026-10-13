import { concatWaveforms } from "../rewind/wav";
import { countDetails, cueForSeconds, dayCoverage, partsCovered, rewindStats } from "../rewind/stats";
import { barForVolume, emptyBars, MIN_BAR, pushBar, smoothBar } from "../rewind/waveform";
import { acceptReview } from "../rewind/reviewPrompt";
import { rewindReminderDates } from "../rewind/reminder";
import { dayLabel, rewindCardVisible } from "../rewind/labels";

describe("joining recordings", () => {
  it("joins recordings back to back", () => {
    const joined = concatWaveforms([new Float32Array([1, 2]), new Float32Array([]), new Float32Array([3])]);
    expect(Array.from(joined)).toEqual([1, 2, 3]);
  });
});

describe("how much of the day came up", () => {
  it("finds the parts of the day from the words", () => {
    const c = dayCoverage("I woke up late and had coffee. At lunch I met Sam. Tonight we made dinner.");
    expect(c).toEqual({ morning: true, midday: true, evening: true });
    expect(partsCovered(c)).toBe(3);
  });

  it("reads times with am and pm", () => {
    expect(dayCoverage("At 8:30 am the train was late")).toMatchObject({ morning: true, midday: false, evening: false });
    expect(dayCoverage("We left around 2 pm and got back at 7 pm")).toMatchObject({ midday: true, evening: true, morning: false });
  });

  it("is empty when nothing about the day comes up", () => {
    expect(partsCovered(dayCoverage("Things were fine and then they weren't"))).toBe(0);
  });

  it("points the cue at a third of the take each", () => {
    expect(cueForSeconds(10)).toBe("morning");
    expect(cueForSeconds(60)).toBe("midday");
    expect(cueForSeconds(110)).toBe("evening");
  });
});

describe("concrete details", () => {
  it("counts numbers, times, names and the senses", () => {
    const d = countDetails("At 8 am I walked to the station with Maria. It was cold and loud, and the train had 12 carriages. We bought two coffees.");
    expect(d.times).toBe(1);
    expect(d.names).toBe(1);
    expect(d.numbers).toBe(2); // 12 and "two"
    expect(d.senses).toBe(2); // cold, loud
    expect(d.total).toBe(6);
  });

  it("doesn't count the first word of a sentence, or I, as a name", () => {
    expect(countDetails("Then I went home. Later I slept.").names).toBe(0);
  });

  it("finds nothing in a vague account", () => {
    expect(countDetails("it was a normal day and nothing much happened").total).toBe(0);
  });
});

describe("rewind stats", () => {
  it("reports length, words, coverage, details and long pauses", () => {
    const volume = [
      { tMs: 0, value: 4 },
      { tMs: 100, value: 4 },
      { tMs: 200, value: 0 },
      ...Array.from({ length: 40 }, (_, i) => ({ tMs: 300 + i * 100, value: 0 })),
      { tMs: 4400, value: 5 },
    ];
    const stats = rewindStats({ transcript: "I woke at 7 am and had coffee with Sam", seconds: 71.4, volume });
    expect(stats.seconds).toBe(71);
    expect(stats.words).toBe(10);
    expect(stats.coverage.morning).toBe(true);
    expect(stats.details.total).toBeGreaterThanOrEqual(2);
    expect(stats.longPauses).toBe(1);
    expect(stats.longestPauseSeconds).toBeCloseTo(4.2, 1);
  });

  it("has no pause to report when there was no long one", () => {
    const stats = rewindStats({ transcript: "hello", seconds: 5, volume: [{ tMs: 0, value: 3 }, { tMs: 100, value: 3 }] });
    expect(stats.longestPauseSeconds).toBeNull();
    expect(stats.longPauses).toBe(0);
  });
});

describe("waveform", () => {
  it("draws silence as a hairline and speech taller", () => {
    expect(barForVolume(-2)).toBe(MIN_BAR);
    expect(barForVolume(0)).toBe(MIN_BAR);
    expect(barForVolume(3)).toBeGreaterThan(barForVolume(1));
    expect(barForVolume(20)).toBe(1);
  });

  it("rises quickly and falls slowly", () => {
    const up = smoothBar(0.1, 0.9) - 0.1;
    const down = 0.9 - smoothBar(0.9, 0.1);
    expect(up).toBeGreaterThan(down);
  });

  it("keeps a fixed window with the newest bar last", () => {
    let bars = emptyBars(4);
    bars = pushBar(bars, 0.5, 4);
    bars = pushBar(bars, 0.6, 4);
    expect(bars).toHaveLength(4);
    expect(bars.slice(-2)).toEqual([0.5, 0.6]);
    expect(pushBar([0.2], 0.9, 3)).toEqual([MIN_BAR, 0.2, 0.9]);
  });
});

describe("the review's notes", () => {
  const good = {
    specificity: "You named Maria and the 8 am train, which made it real.",
    storytelling: "The platform moment told a small story, not a list.",
    flow: "You went morning to evening in order.",
    coverage: "Midday got only one line.",
    vividDetail: "the train had twelve carriages",
    tryTomorrow: "Add one thing you heard.",
  };

  it("keeps a review whose notes all say something", () => {
    expect(acceptReview(good)).toEqual(good);
  });

  it("drops one with an empty note", () => {
    expect(acceptReview({ ...good, flow: "  " })).toBeNull();
  });

  it("drops one that turns into a score", () => {
    expect(acceptReview({ ...good, specificity: "Solid, around 7/10 for detail." })).toBeNull();
    expect(acceptReview({ ...good, flow: "You scored well on order." })).toBeNull();
    expect(acceptReview({ ...good, coverage: "About 80% of the day." })).toBeNull();
  });
});

describe("the evening reminder", () => {
  it("arms tonight and the evenings after", () => {
    const now = new Date(2026, 9, 12, 18, 0);
    const dates = rewindReminderDates({ hour: 21, now, toldToday: false });
    expect(dates).toHaveLength(7);
    expect(dates[0].getDate()).toBe(12);
    expect(dates.every((d) => d.getHours() === 21)).toBe(true);
  });

  it("skips tonight once the day is told, or the hour has passed", () => {
    const told = rewindReminderDates({ hour: 21, now: new Date(2026, 9, 12, 18, 0), toldToday: true });
    expect(told[0].getDate()).toBe(13);
    expect(told).toHaveLength(6);
    const late = rewindReminderDates({ hour: 21, now: new Date(2026, 9, 12, 21, 30), toldToday: false });
    expect(late[0].getDate()).toBe(13);
  });

  it("works across a month end", () => {
    const dates = rewindReminderDates({ hour: 21, now: new Date(2026, 9, 30, 10, 0), toldToday: false }, 3);
    expect(dates.map((d) => `${d.getMonth() + 1}/${d.getDate()}`)).toEqual(["10/30", "10/31", "11/1"]);
  });
});

describe("labels", () => {
  const now = new Date(2026, 9, 12, 20, 0);

  it("names today and yesterday, and dates the rest", () => {
    expect(dayLabel("2026-10-12", now)).toBe("Today");
    expect(dayLabel("2026-10-11", now)).toBe("Yesterday");
    expect(dayLabel("2026-10-03", now)).toMatch(/Oct/);
  });

  it("knows yesterday across a month end", () => {
    expect(dayLabel("2026-09-30", new Date(2026, 9, 1, 9, 0))).toBe("Yesterday");
  });

  it("shows the evening card from 6 PM until the day is told", () => {
    expect(rewindCardVisible(new Date(2026, 9, 12, 17, 59), false)).toBe(false);
    expect(rewindCardVisible(new Date(2026, 9, 12, 18, 0), false)).toBe(true);
    expect(rewindCardVisible(new Date(2026, 9, 12, 23, 30), false)).toBe(true);
    expect(rewindCardVisible(new Date(2026, 9, 12, 21, 0), true)).toBe(false);
  });
});
