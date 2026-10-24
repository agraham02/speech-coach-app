import { clampViewport, fullViewport, isZoomed, msOfX, panViewport, runPath, seriesRuns, spanOf, timeTicks, valueAtMs, xOfMs, zoomViewport, type Series } from "../results/timeline";
import { loudnessAxis, paceAxis, paceSeries, pitchAxis, pitchCoverageNote, pitchReadout } from "../results/charts";
import { groundAiMarks, locateUniqueQuote, MAX_AI_MARKS } from "../results/aiMarks";

describe("viewport", () => {
  const D = 90_000;
  test("starts as the whole take and is not zoomed", () => {
    expect(fullViewport(D)).toEqual({ startMs: 0, endMs: D });
    expect(isZoomed(fullViewport(D), D)).toBe(false);
  });

  test("zooming keeps the anchored moment under the same spot", () => {
    const vp = zoomViewport(fullViewport(D), 3, 60_000, D);
    expect(spanOf(vp)).toBeCloseTo(30_000);
    // 60 s was at two thirds of the width; still is.
    expect((60_000 - vp.startMs) / spanOf(vp)).toBeCloseTo(2 / 3, 3);
    expect(isZoomed(vp, D)).toBe(true);
  });

  test("never zooms past the minimum span or out past the take", () => {
    const tight = zoomViewport(fullViewport(D), 1000, 10_000, D);
    expect(spanOf(tight)).toBe(8_000);
    expect(zoomViewport(fullViewport(D), 0.1, 10_000, D)).toEqual(fullViewport(D));
  });

  test("panning stops at the ends", () => {
    const vp = { startMs: 10_000, endMs: 40_000 };
    expect(panViewport(vp, -50_000, D)).toEqual({ startMs: 0, endMs: 30_000 });
    expect(panViewport(vp, 500_000, D)).toEqual({ startMs: 60_000, endMs: 90_000 });
  });

  test("a take shorter than the minimum span is its own window", () => {
    expect(clampViewport({ startMs: 0, endMs: 3000 }, 5000)).toEqual({ startMs: 0, endMs: 5000 });
  });

  test("x and time convert both ways", () => {
    const vp = { startMs: 20_000, endMs: 60_000 };
    expect(xOfMs(40_000, vp, 200)).toBe(100);
    expect(msOfX(100, vp, 200)).toBe(40_000);
  });

  test("ticks are round numbers inside the window, about five", () => {
    expect(timeTicks(fullViewport(90_000))).toEqual([0, 30_000, 60_000, 90_000]);
    const zoomed = timeTicks({ startMs: 12_000, endMs: 22_000 });
    expect(zoomed).toEqual([12_000, 14_000, 16_000, 18_000, 20_000, 22_000]);
  });
});

describe("series drawing", () => {
  const series: Series = { tMs: [0, 100, 200, 300, 400], v: [1, 2, null, 3, 4], bucketMs: 100 };
  const vp = fullViewport(500);

  test("a gap ends a run and is never drawn as a value", () => {
    const runs = seriesRuns(series, vp, 500, (v) => v * 10);
    expect(runs).toHaveLength(2);
    expect(runs[0].map((p) => p.y)).toEqual([10, 20]);
    expect(runs[1].map((p) => p.y)).toEqual([30, 40]);
  });

  test("buckets are drawn at their middle", () => {
    const runs = seriesRuns(series, vp, 500, (v) => v);
    expect(runs[0][0].x).toBe(50);
  });

  test("a lone point still gets a stroke", () => {
    expect(runPath([{ x: 5, y: 7 }])).toBe("M5.0 7.0h2");
  });

  test("reads the bucket under a moment, null in a gap", () => {
    expect(valueAtMs(series, 150)).toBe(2);
    expect(valueAtMs(series, 250)).toBeNull();
    expect(valueAtMs(series, 9_999)).toBeNull();
  });

  test("zoomed in, buckets far outside the window are left out", () => {
    const long: Series = { tMs: Array.from({ length: 100 }, (_, i) => i * 100), v: Array.from({ length: 100 }, () => 1), bucketMs: 100 };
    const runs = seriesRuns(long, { startMs: 4000, endMs: 5000 }, 100, () => 0);
    expect(runs[0].length).toBeLessThan(15);
  });
});

describe("chart scales", () => {
  test("pitch is symmetric around the median and never narrower than 6 semitones either way", () => {
    expect(pitchAxis([0.5, -1, null]).max).toBe(6);
    expect(pitchAxis([7.2, -3]).max).toBe(9);
    expect(pitchAxis([30]).max).toBe(12);
    const axis = pitchAxis([1]);
    expect(axis.ticks.map((t) => t.label)).toEqual(["−6", "−3", "0", "+3", "+6"]);
  });

  test("a flat voice stays visibly flat: the axis does not shrink to fit it", () => {
    const flat = pitchAxis([0.2, -0.3, 0.1]);
    expect(flat.max - flat.min).toBe(12);
  });

  test("loudness is relative to the speaking level", () => {
    expect(loudnessAxis([3, -5, null]).max).toBe(12);
    expect(loudnessAxis([20]).max).toBe(24);
  });

  test("pace axis starts at zero and holds the fastest window", () => {
    const axis = paceAxis([{ bucketStartSeconds: 0, wpm: 120 }, { bucketStartSeconds: 5, wpm: 215 }]);
    expect(axis.min).toBe(0);
    expect(axis.max).toBe(250);
    expect(paceSeries([{ bucketStartSeconds: 5, wpm: 100 }]).tMs).toEqual([5000]);
  });

  test("pitch readout gives semitones and the Hz it means for this voice", () => {
    expect(pitchReadout(12, 100)).toBe("+12 st (about 200 Hz)");
    expect(pitchReadout(-1.04, null)).toBe("−1 st");
  });

  test("thin pitch data is said to be thin", () => {
    expect(pitchCoverageNote(0.2, 6)).toContain("only 20%");
    expect(pitchCoverageNote(0.8, 40)).toContain("80%");
    expect(pitchCoverageNote(null, null)).toBeNull();
  });
});

describe("AI marks", () => {
  const transcript = "So I think the main point is that sleep matters. Um, sleep matters because it fixes your memory. And like, sleep really matters a lot.";

  test("finds a quote whole-word, ignoring case and punctuation, in one place", () => {
    const span = locateUniqueQuote(transcript, "Because it fixes your memory");
    expect(span).not.toBeNull();
    expect(transcript.slice(span!.start, span!.end)).toBe("because it fixes your memory");
  });

  test("drops a quote that is missing, too short or ambiguous", () => {
    expect(locateUniqueQuote(transcript, "sleep is overrated entirely")).toBeNull();
    expect(locateUniqueQuote(transcript, "sleep matters")).toBeNull();
    expect(locateUniqueQuote(transcript, "sleep matters because it fixes your memory")).not.toBeNull();
    expect(locateUniqueQuote("sleep matters a lot. sleep matters a lot.", "sleep matters a lot")).toBeNull();
  });

  test("does not match inside a longer word", () => {
    expect(locateUniqueQuote("the cat sat on the mat today", "cat sat on th")).toBeNull();
  });

  test("keeps only marks about the words, labelled in the taxonomy's names", () => {
    const marks = groundAiMarks(transcript, [
      { quote: "sleep really matters a lot", category: "restated_point", note: "Said again." },
      { quote: "you sounded rushed here today", category: "delivery", note: "Fast." },
      { quote: "the main point is that sleep matters", category: "structure", note: "A clear opening." },
      { quote: "your eyes drifted away from", category: "presence", note: "Looked away." },
    ]);
    expect(marks.map((m) => m.label)).toEqual(["Structure", "Repeated idea"]);
    expect(marks[0].start).toBeLessThan(marks[1].start);
  });

  test("overlapping marks keep the first, and there are never more than the cap", () => {
    const overlap = groundAiMarks(transcript, [
      { quote: "the main point is that sleep matters", category: "structure", note: "A." },
      { quote: "point is that sleep matters because", category: "content", note: "B." },
    ]);
    expect(overlap).toHaveLength(1);
    const words = Array.from({ length: 40 }, (_, i) => `w${i}`).join(" ");
    const many = Array.from({ length: 10 }, (_, i) => ({ quote: `w${i * 4} w${i * 4 + 1} w${i * 4 + 2}`, category: "content" as const, note: "n" }));
    expect(groundAiMarks(words, many)).toHaveLength(MAX_AI_MARKS);
  });
});
