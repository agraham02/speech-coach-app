import { readFileSync } from "fs";
import { join } from "path";
import {
  clampStop,
  compareSentence,
  DAYS_MONDAY_FIRST,
  formatScore,
  indicatorTranslateX,
  markerPosition,
  nextFilterSelection,
  normalizeDays,
  placeMarkers,
  ratingValueText,
  sameDays,
  segmentIndicator,
  shortcutDays,
  stacksValue,
  stepRating,
  toggleDay,
  toggleKey,
} from "../inputLogic";

describe("days", () => {
  it("shows Monday first and Sunday (0) last", () => {
    expect(DAYS_MONDAY_FIRST).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it("keeps day numbers valid, unique and sorted", () => {
    expect(normalizeDays([3, 1, 1, 9, -1, 2.5, 0])).toEqual([0, 1, 3]);
  });

  it("switches a day on and off", () => {
    expect(toggleDay([1, 3], 5)).toEqual([1, 3, 5]);
    expect(toggleDay([1, 3, 5], 3)).toEqual([1, 5]);
    expect(toggleDay([1], 0)).toEqual([0, 1]);
  });

  it("never lets the last day go off", () => {
    expect(toggleDay([4], 4)).toEqual([4]);
    expect(toggleDay([0], 0)).toEqual([0]);
  });

  it("sets the shortcuts", () => {
    expect(shortcutDays("every")).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(shortcutDays("weekdays")).toEqual([1, 2, 3, 4, 5]);
    expect(sameDays([5, 4, 3, 2, 1], shortcutDays("weekdays"))).toBe(true);
    expect(sameDays([1, 2], shortcutDays("weekdays"))).toBe(false);
  });
});

describe("rating track", () => {
  it("clamps to the stops", () => {
    expect(clampStop(0)).toBe(1);
    expect(clampStop(9)).toBe(5);
    expect(clampStop(3.4)).toBe(3);
  });

  it("increments and decrements within 1 to 5", () => {
    expect(stepRating(3, 1)).toBe(4);
    expect(stepRating(3, -1)).toBe(2);
    expect(stepRating(5, 1)).toBeNull();
    expect(stepRating(1, -1)).toBeNull();
  });

  it("starts from the first stop and never presets a middle value", () => {
    expect(stepRating(null, 1)).toBe(1);
    expect(stepRating(null, -1)).toBeNull();
  });

  it("says its value", () => {
    expect(ratingValueText(null)).toBe("Not rated");
    expect(ratingValueText(4)).toBe("4 out of 5");
  });
});

describe("compare track", () => {
  it("places values 1 to 5 along the line, fractions included", () => {
    expect(markerPosition(1)).toBe(0);
    expect(markerPosition(3)).toBe(0.5);
    expect(markerPosition(5)).toBe(1);
    expect(markerPosition(3.6)).toBeCloseTo(0.65);
    expect(markerPosition(0)).toBe(0);
    expect(markerPosition(7)).toBe(1);
  });

  it("formats scores without a trailing .0", () => {
    expect(formatScore(3)).toBe("3");
    expect(formatScore(3.6)).toBe("3.6");
    expect(formatScore(3.04)).toBe("3");
    expect(formatScore(3.66)).toBe("3.7");
  });

  it("reads out as one sentence", () => {
    expect(compareSentence({ felt: 3, after: 4, measured: 3.6 })).toBe("You felt 3, after watching 4, measured 3.6 out of 5");
  });

  it("leaves out what's missing", () => {
    expect(compareSentence({ felt: 3, measured: 3.6 })).toBe("You felt 3, measured 3.6 out of 5");
    expect(compareSentence({ after: 4 })).toBe("After watching 4 out of 5");
    expect(compareSentence({})).toBe("No ratings yet");
  });

  it("puts a label above unless it would collide, then below", () => {
    const apart = placeMarkers({ felt: 1, after: 3, measured: 5 });
    expect(apart.map((m) => m.side)).toEqual(["above", "above", "above"]);
    const close = placeMarkers({ felt: 3, after: 3.2, measured: 3.4 });
    const sides = Object.fromEntries(close.map((m) => [m.key, m.side]));
    expect(sides.felt).toBe("above");
    expect(sides.after).toBe("below");
    expect(close).toHaveLength(3);
  });

  it("joins a label that has no room either side to its neighbour, so a tie never prints labels on top of each other", () => {
    const tie = placeMarkers({ felt: 3, after: 3, measured: 3 });
    const shown = tie.filter((m) => m.names.length > 0);
    // Every marker is named exactly once, and no two shown labels share a side at the same spot.
    expect(tie.flatMap((m) => m.names).sort()).toEqual(["after", "felt", "measured"]);
    expect(new Set(shown.map((m) => m.side)).size).toBe(shown.length);
    expect(placeMarkers({ felt: 1, after: 3, measured: 5 }).map((m) => m.names)).toEqual([["felt"], ["after"], ["measured"]]);
  });

  it("skips markers without a value", () => {
    expect(placeMarkers({ felt: 2, after: null }).map((m) => m.key)).toEqual(["felt"]);
  });
});

describe("checklist and filter chips", () => {
  const order = ["a", "b", "c", "d"];

  it("toggles a key and keeps the list's order", () => {
    expect(toggleKey(["c"], "a", order)).toEqual(["a", "c"]);
    expect(toggleKey(["a", "c"], "c", order)).toEqual(["a"]);
  });

  it("filters: multi toggles, single replaces", () => {
    expect(nextFilterSelection(["a"], "b", order, true)).toEqual(["a", "b"]);
    expect(nextFilterSelection(["a"], "b", order, false)).toEqual(["b"]);
    expect(nextFilterSelection(["a"], "a", order, false)).toEqual(["a"]);
    expect(nextFilterSelection(["a"], "a", order, false, true)).toEqual([]);
  });
});

describe("segmented control", () => {
  it("places the thumb from measured widths, for any count", () => {
    expect(segmentIndicator([100, 100], 0)).toEqual({ width: 100, offset: 0 });
    expect(segmentIndicator([100, 100], 1)).toEqual({ width: 100, offset: 100 });
    expect(segmentIndicator([80, 120, 90, 110], 2)).toEqual({ width: 90, offset: 200 });
  });

  it("copes with unequal widths from larger text", () => {
    expect(segmentIndicator([70, 150, 90], 2)).toEqual({ width: 90, offset: 220 });
  });

  it("waits until what it needs is measured", () => {
    expect(segmentIndicator([], 0)).toBeNull();
    expect(segmentIndicator([100, undefined], 1)).toEqual(null);
    expect(segmentIndicator([undefined, 100], 1)).toBeNull();
    expect(segmentIndicator([100], 3)).toBeNull();
  });

  it("slides the other way in right-to-left", () => {
    const i = { width: 100, offset: 100 };
    expect(indicatorTranslateX(i, false)).toBe(100);
    expect(indicatorTranslateX(i, true)).toBe(-100);
  });
});

describe("value row", () => {
  it("stacks the value under the label at the largest text sizes", () => {
    expect(stacksValue(1)).toBe(false);
    expect(stacksValue(1.3)).toBe(false);
    expect(stacksValue(2)).toBe(true);
  });
});

describe("the input files", () => {
  const files = ["ValueRow", "OptionCards", "DayPicker", "RatingTrack", "CompareTrack", "ChecklistRows", "FilterChips"].map((n) => join(__dirname, "..", `${n}.tsx`));
  files.push(join(__dirname, "..", "..", "common", "SegmentedControl.tsx"));

  it("use Txt and fonts, never raw Text or fontWeight", () => {
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect([file, /<Text[\s>]/.test(text)]).toEqual([file, false]);
      expect([file, /fontWeight/.test(text)]).toEqual([file, false]);
    }
  });
});
