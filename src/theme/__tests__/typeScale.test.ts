import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";
import { typeScale } from "../tokens";

// Task 8.1: one type scale. Text goes through <Txt> (or theme.type), so the old
// `typography` sizes and raw <Text> can't creep back in.

const SRC = join(__dirname, "..", "..");
// Txt is the one place that renders react-native's Text. The iOS widget runs
// in its own renderer and needs it too.
const ALLOWED_TEXT = ["components/common/Txt.tsx", "widgets/"];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" || name === "node_modules" ? [] : files(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const sources = files(SRC).map((path) => ({ path: relative(SRC, path).split(sep).join("/"), text: readFileSync(path, "utf8") }));

describe("the one type scale", () => {
  it("has no old typography sizes or display families left", () => {
    const left = sources.filter((f) => /\btypography\.|\bfontDisplay\./.test(f.text)).map((f) => f.path);
    expect(left).toEqual([]);
  });

  it("renders text through Txt, not raw Text", () => {
    const raw = sources.filter((f) => f.path.endsWith(".tsx") && !ALLOWED_TEXT.some((a) => f.path.startsWith(a)) && /<Text[\s>]/.test(f.text)).map((f) => f.path);
    expect(raw).toEqual([]);
  });

  it("matches the canvas: light big numbers, a small-caps label, sentence headlines", () => {
    expect(typeScale.display).toMatchObject({ fontSize: 52, fontFamily: "InstrumentSans-Regular" });
    expect(typeScale.label).toMatchObject({ fontSize: 12, textTransform: "uppercase" });
    expect(typeScale.say).toMatchObject({ fontSize: 34, fontFamily: "InstrumentSans-Medium" });
    for (const [name, style] of Object.entries(typeScale)) {
      expect([name, (style as { lineHeight: number }).lineHeight >= (style as { fontSize: number }).fontSize]).toEqual([name, true]);
      expect([name, "fontWeight" in style]).toEqual([name, false]);
    }
  });
});

describe("display tracking", () => {
  it("scales with a resized display number and leaves explicit tracking alone", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { displayTracking } = require("../../components/common/Txt");
    expect(displayTracking({ fontSize: 44 })).toEqual({ letterSpacing: -2.9 });
    expect(displayTracking([{ fontSize: 76 }])).toEqual({ letterSpacing: -4.9 });
    expect(displayTracking({ fontSize: 44, letterSpacing: -0.5 })).toBeNull();
    expect(displayTracking(undefined)).toBeNull();
  });
});
