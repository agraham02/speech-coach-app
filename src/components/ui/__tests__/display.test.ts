import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import {
  accordionTiming,
  bandBox,
  bandLabel,
  bandPosition,
  bandTint,
  bigNumberLabel,
  bigNumberStyle,
  bigNumberUnitText,
  capsuleCurrentIndex,
  capsuleFlexes,
  capsuleLabel,
  ladderHeights,
  ladderLabel,
  ladderState,
  sayPlainText,
  sayTone,
  SAY_SIZES,
  weekCircle,
  weekDayLabel,
  weekOrder,
  type CapsuleStep,
} from "../displayLogic";
import { lightPalette } from "../../../theme/tokens";

describe("bands", () => {
  it("positions first, middle, last and only", () => {
    expect([0, 1, 2].map((i) => bandPosition(i, 3))).toEqual(["first", "middle", "last"]);
    expect(bandPosition(0, 1)).toBe("only");
    expect(bandPosition(0, 2)).toBe("first");
    expect(bandPosition(1, 2)).toBe("last");
  });

  it("cycles the five tints in order unless one is given", () => {
    const tints = lightPalette.bands;
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => bandTint(i, tints))).toEqual([...tints, tints[0], tints[1]]);
    expect(bandTint(1, tints, "#123456")).toBe("#123456");
    expect(bandTint(-1, tints)).toBe(tints[4]);
  });

  it("follows the CSS box: 13/27, overlap 14, last rounded with 15", () => {
    expect(bandBox("first", "default", false)).toMatchObject({ paddingTop: 13, paddingBottom: 27, marginTop: 0, borderTopLeftRadius: 22, borderBottomLeftRadius: 0 });
    expect(bandBox("middle", "default", false)).toMatchObject({ marginTop: -14, paddingBottom: 27, borderBottomRightRadius: 0 });
    expect(bandBox("last", "default", false)).toMatchObject({ marginTop: -14, paddingBottom: 15, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 });
    expect(bandBox("only", "default", false)).toMatchObject({ marginTop: 0, paddingBottom: 15, borderBottomLeftRadius: 22 });
  });

  it("tightens a done band and pads a big one", () => {
    expect(bandBox("middle", "done", false)).toMatchObject({ paddingTop: 9, paddingBottom: 23 });
    expect(bandBox("middle", "default", true)).toMatchObject({ paddingTop: 16, paddingBottom: 30 });
    expect(bandBox("last", "done", false).paddingBottom).toBe(15);
  });

  it("reads a band out as one sentence", () => {
    expect(bandLabel({ number: 2, title: "Warm up", meta: "2 min" })).toBe("2, Warm up, 2 min");
    expect(bandLabel({ number: 1, title: "Breathe", subtitle: "Slow", state: "done" })).toBe("1, Breathe, Slow, done");
    expect(bandLabel({ title: "Level 3", state: "locked" })).toBe("Level 3, locked");
  });
});

describe("sentence headline", () => {
  it("has the three sizes from the canvas", () => {
    expect(SAY_SIZES.l).toEqual({ fontSize: 34, lineHeight: 38, letterSpacing: -0.9 });
    expect(SAY_SIZES.m).toEqual({ fontSize: 27, lineHeight: 31, letterSpacing: -0.6 });
    expect(SAY_SIZES.s).toEqual({ fontSize: 22, lineHeight: 27, letterSpacing: -0.4 });
  });

  it("puts strong and tappable parts in full ink", () => {
    expect(sayTone({ text: "Today, " })).toBe("muted");
    expect(sayTone({ text: "10 min", strong: true })).toBe("primary");
    expect(sayTone({ text: "10 min", onPress: () => undefined })).toBe("primary");
  });

  it("joins the segments into the spoken sentence", () => {
    expect(sayPlainText([{ text: "Today, " }, { text: "10 min", strong: true }])).toBe("Today, 10 min");
  });
});

describe("big number", () => {
  it("is the display style at 52 and scales in proportion", () => {
    expect(bigNumberStyle()).toEqual({ fontSize: 52, lineHeight: 54, letterSpacing: -3.4 });
    const big = bigNumberStyle(76);
    expect(big.fontSize).toBe(76);
    expect(big.lineHeight).toBe(79);
    expect(big.letterSpacing).toBe(-5);
  });

  it("spaces word units and hugs symbols", () => {
    expect(bigNumberUnitText("min")).toBe(" min");
    expect(bigNumberUnitText("%")).toBe("%");
    expect(bigNumberUnitText("/100")).toBe("/100");
    expect(bigNumberLabel(142, "wpm")).toBe("142 wpm");
    expect(bigNumberLabel(82, "/100")).toBe("82/100");
    expect(bigNumberLabel(7)).toBe("7");
  });
});

describe("capsules", () => {
  const steps: CapsuleStep[] = [
    { minutes: 1, state: "done", name: "Breathe" },
    { minutes: 2, state: "done", name: "Warm up" },
    { minutes: 4, state: "current", name: "Drill" },
    { minutes: 2, state: "todo", name: "Say it" },
    { minutes: 1, state: "todo", name: "Wrap up" },
  ];

  it("sizes each capsule by its minutes, never zero", () => {
    expect(capsuleFlexes(steps)).toEqual([1, 2, 4, 2, 1]);
    expect(capsuleFlexes([{ minutes: 0, state: "todo" }, { minutes: Number.NaN, state: "todo" }])).toEqual([1, 1]);
  });

  it("says which step you are on", () => {
    expect(capsuleLabel(steps)).toBe("Step 3 of 5, Drill");
    expect(capsuleCurrentIndex(steps)).toBe(2);
  });

  it("falls back to the next step, then the last", () => {
    const next = steps.map((s, i): CapsuleStep => ({ ...s, state: i < 2 ? "done" : "todo" }));
    expect(capsuleLabel(next)).toBe("Step 3 of 5, Drill");
    const all = steps.map((s): CapsuleStep => ({ ...s, state: "done" }));
    expect(capsuleLabel(all)).toBe("Step 5 of 5, Wrap up");
    expect(capsuleLabel([{ minutes: 1, state: "current" }])).toBe("Step 1 of 1");
    expect(capsuleLabel([])).toBe("No steps");
  });
});

describe("ladder", () => {
  it("rises evenly to 56", () => {
    expect(ladderHeights(5)).toEqual([11, 22, 34, 45, 56]);
    expect(ladderHeights(4)).toEqual([14, 28, 42, 56]);
    expect(ladderHeights(0)).toEqual([]);
    const h = ladderHeights(6);
    expect(h[5]).toBe(56);
    expect(h.every((v, i) => i === 0 || v > h[i - 1])).toBe(true);
  });

  it("marks stages before the current as done and after as to do", () => {
    expect([0, 1, 2, 3, 4].map((i) => ladderState(i, 3))).toEqual(["done", "done", "current", "todo", "todo"]);
    expect([0, 1].map((i) => ladderState(i, 0))).toEqual(["todo", "todo"]);
  });

  it("says the stage", () => {
    expect(ladderLabel(3, 5, ["Start", "Build", "Steady", "Strong", "Ready"])).toBe("Stage 3 of 5, Steady");
    expect(ladderLabel(2, 4, undefined, "Level")).toBe("Level 2 of 4");
    expect(ladderLabel(9, 5)).toBe("Stage 5 of 5");
    expect(ladderLabel(0, 5)).toBe("Stage 1 of 5");
  });
});

describe("accordion", () => {
  const d = { fast: 160, base: 260 };
  it("eases height and fades on the motion tokens", () => {
    expect(accordionTiming(false, d)).toEqual({ height: 260, fade: 160 });
  });
  it("with Reduce Motion skips the height animation and fades in 150 ms", () => {
    expect(accordionTiming(true, d)).toEqual({ height: 0, fade: 150 });
  });
});

describe("week strip", () => {
  it("starts on Monday or Sunday", () => {
    expect(weekOrder().map((d) => d.letter).join("")).toBe("MTWTFSS");
    expect(weekOrder()[1].name).toBe("Tuesday");
    expect(weekOrder(0).map((d) => d.letter).join("")).toBe("SMTWTFS");
    expect(weekOrder(0)[0].name).toBe("Sunday");
  });

  it("labels each day with its state", () => {
    expect(weekDayLabel("Tuesday", "full", false)).toBe("Tuesday, practised");
    expect(weekDayLabel("Thursday", "future", true)).toBe("Thursday, today, not yet");
    expect(weekDayLabel("Monday", "frozen", false)).toBe("Monday, streak frozen");
    expect(weekDayLabel("Sunday", "part", false)).toBe("Sunday, partly practised");
    expect(weekDayLabel("Saturday", "missed", false)).toBe("Saturday, missed");
  });

  it("draws every state a different shape", () => {
    const shapes = (["full", "part", "frozen", "missed", "future"] as const).map((s) => JSON.stringify(weekCircle(s)));
    // Missed and future share a look; the other three are each unique.
    expect(new Set(shapes).size).toBe(4);
    expect(weekCircle("full")).toMatchObject({ filled: true });
    expect(weekCircle("part")).toMatchObject({ ringWidth: 3, dashed: false });
    expect(weekCircle("frozen")).toMatchObject({ ringWidth: 2, glyph: "snow" });
    expect(weekCircle("missed")).toEqual(weekCircle("future"));
    expect(weekCircle("missed")).toMatchObject({ ringWidth: 2, dashed: true });
  });
});

describe("the ui files follow the conventions", () => {
  const dir = join(__dirname, "..");
  const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f));
  it("has no raw Text and no fontWeight", () => {
    for (const f of files) {
      const text = readFileSync(join(dir, f), "utf8");
      expect([f, /<Text[\s>]/.test(text)]).toEqual([f, false]);
      expect([f, /fontWeight/.test(text)]).toEqual([f, false]);
    }
  });
});
