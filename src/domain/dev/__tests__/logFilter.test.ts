import { countRecent, extraLineCount, filterLogs, firstLine, formatLogLines, isFiltering, logTag, NO_FILTER, tagCounts, type LogLike } from "../logFilter";

const entries: LogLike[] = [
  { timestamp: "2026-10-16T10:00:03.000Z", level: "error", message: "[crash] boom\nat a\nat b" },
  { timestamp: "2026-10-16T10:00:02.000Z", level: "warn", message: "[cloud] slow response" },
  { timestamp: "2026-10-16T10:00:01.000Z", level: "info", message: "[pipeline] s1: transcribe done" },
  { timestamp: "2026-10-16T10:00:00.000Z", level: "info", message: "[pipeline] s1: presence done" },
  { timestamp: "2026-10-15T08:00:00.000Z", level: "error", message: "no tag here" },
];

describe("logTag", () => {
  it("reads the leading tag", () => {
    expect(logTag("[Pipeline] x")).toBe("pipeline");
    expect(logTag("[uncaught, fatal] x")).toBe("uncaught");
  });
  it("is null without one", () => {
    expect(logTag("plain")).toBeNull();
    expect(logTag("text [tag] later")).toBeNull();
  });
});

describe("lines", () => {
  it("splits multi-line messages", () => {
    expect(firstLine("a\nb\nc")).toBe("a");
    expect(extraLineCount("a\nb\nc")).toBe(2);
    expect(extraLineCount("a")).toBe(0);
  });
});

describe("filterLogs", () => {
  it("returns everything with no filter", () => {
    expect(filterLogs(entries, NO_FILTER)).toHaveLength(5);
    expect(isFiltering(NO_FILTER)).toBe(false);
  });
  it("filters by level, including higher levels", () => {
    expect(filterLogs(entries, { ...NO_FILTER, level: "warn" })).toHaveLength(3);
    expect(filterLogs(entries, { ...NO_FILTER, level: "error" })).toHaveLength(2);
  });
  it("filters by any selected tag, dropping untagged entries", () => {
    const out = filterLogs(entries, { ...NO_FILTER, tags: ["cloud", "crash"] });
    expect(out.map((e) => logTag(e.message))).toEqual(["crash", "cloud"]);
  });
  it("searches case-insensitively through the whole message", () => {
    expect(filterLogs(entries, { ...NO_FILTER, query: "AT B" })).toHaveLength(1);
    expect(isFiltering({ ...NO_FILTER, query: "  " })).toBe(false);
  });
  it("combines filters", () => {
    expect(filterLogs(entries, { level: "warn", tags: ["pipeline"], query: "" })).toHaveLength(0);
  });
});

describe("tagCounts", () => {
  it("counts by frequency then name", () => {
    expect(tagCounts(entries)).toEqual([
      { tag: "pipeline", count: 2 },
      { tag: "cloud", count: 1 },
      { tag: "crash", count: 1 },
    ]);
  });
});

describe("countRecent", () => {
  const now = new Date("2026-10-16T12:00:00.000Z").getTime();
  it("counts entries inside the window at or above the level", () => {
    expect(countRecent(entries, "error", 24 * 3600_000, now)).toBe(1);
    expect(countRecent(entries, "warn", 24 * 3600_000, now)).toBe(2);
    expect(countRecent(entries, "error", 48 * 3600_000, now)).toBe(2);
  });
});

describe("formatLogLines", () => {
  it("is oldest first", () => {
    const lines = formatLogLines(entries).split("\n");
    expect(lines[0]).toContain("no tag here");
  });
});
