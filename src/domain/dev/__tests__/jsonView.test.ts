import { describeJson, formatBytes, isContainer, sliceJsonText, topLevelEntries } from "../jsonView";

describe("describeJson", () => {
  it("describes each kind of value", () => {
    expect(describeJson(null)).toBe("null");
    expect(describeJson([1, 2, 3])).toBe("array · 3 items");
    expect(describeJson([1])).toBe("array · 1 item");
    expect(describeJson({ a: 1, b: 2 })).toBe("object · 2 keys");
    expect(describeJson("hello")).toBe("string · 5 chars");
    expect(describeJson(4)).toBe("number");
    expect(describeJson(true)).toBe("boolean");
  });
});

describe("topLevelEntries", () => {
  it("lists object keys in order", () => {
    expect(topLevelEntries({ b: 1, a: [2] }).entries.map((e) => e.key)).toEqual(["b", "a"]);
  });
  it("caps arrays and reports how many are hidden", () => {
    const { entries, hidden } = topLevelEntries(Array.from({ length: 120 }, (_, i) => i), 50);
    expect(entries).toHaveLength(50);
    expect(entries[0].key).toBe("[0]");
    expect(hidden).toBe(70);
  });
  it("has nothing for primitives", () => {
    expect(topLevelEntries(5)).toEqual({ entries: [], hidden: 0 });
    expect(isContainer({})).toBe(true);
    expect(isContainer("x")).toBe(false);
    expect(isContainer(null)).toBe(false);
  });
});

describe("sliceJsonText", () => {
  it("returns everything when short", () => {
    const out = sliceJsonText({ a: 1 }, 1000);
    expect(out.truncated).toBe(false);
    expect(out.text).toBe('{\n  "a": 1\n}');
  });
  it("cuts long output at a line boundary", () => {
    const out = sliceJsonText(Array.from({ length: 500 }, (_, i) => i), 200);
    expect(out.truncated).toBe(true);
    expect(out.text.length).toBeLessThanOrEqual(200);
    expect(out.total).toBeGreaterThan(200);
    expect(out.text.endsWith(",")).toBe(true);
  });
});

describe("formatBytes", () => {
  it("scales units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});
