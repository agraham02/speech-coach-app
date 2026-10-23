import {
  hasFilters,
  inDateRange,
  kindForSessionType,
  kindOptions,
  matchesFilters,
  matchesQuery,
  NO_FILTERS,
  searchText,
  sortNewestFirst,
  transcriptExcerpt,
  type LibraryItem,
} from "../libraryItems";

const now = new Date(2026, 9, 22, 20, 0); // Thu Oct 22 2026, 8 PM local

function item(over: Partial<LibraryItem>): LibraryItem {
  return {
    key: "s:1",
    id: "1",
    kind: "impromptu",
    recordedAt: new Date(2026, 9, 22, 9, 30).toISOString(),
    durationSeconds: 90,
    title: "Describe your favorite place",
    category: "Personal",
    transcript: "",
    status: "done",
    overallScore: 7,
    keepsake: false,
    session: null,
    rewind: null,
    ...over,
  };
}

describe("kindForSessionType", () => {
  it("groups the impromptu takes and keeps scripts and feelings apart", () => {
    expect(kindForSessionType("spontaneous")).toBe("impromptu");
    expect(kindForSessionType("free_record")).toBe("impromptu");
    expect(kindForSessionType("concise")).toBe("impromptu");
    expect(kindForSessionType("script_practice")).toBe("script");
    expect(kindForSessionType("feeling")).toBe("feeling");
  });
});

describe("search", () => {
  const rewind = item({
    key: "r:9",
    kind: "rewind",
    title: "Rewind",
    category: null,
    transcript: "This morning I walked the dog to the Ferry Building",
    recordedAt: new Date(2026, 9, 19, 21, 5).toISOString(), // Monday
    overallScore: null,
  });
  const hay = searchText(rewind, now);

  it("finds what was said", () => {
    expect(matchesQuery(hay, "ferry")).toBe(true);
    expect(matchesQuery(hay, "FERRY building")).toBe(true);
    expect(matchesQuery(hay, "cat")).toBe(false);
  });
  it("finds the type and the day", () => {
    expect(matchesQuery(hay, "rewind monday")).toBe(true);
    expect(matchesQuery(hay, "oct 19")).toBe(true);
    expect(matchesQuery(hay, "october")).toBe(true);
    expect(matchesQuery(hay, "10/19")).toBe(true);
    expect(matchesQuery(hay, "tuesday")).toBe(false);
  });
  it("knows today and yesterday", () => {
    expect(matchesQuery(searchText(item({}), now), "today")).toBe(true);
    expect(matchesQuery(searchText(item({ recordedAt: new Date(2026, 9, 21, 23, 0).toISOString() }), now), "yesterday")).toBe(true);
  });
  it("finds the prompt and its category", () => {
    const hayS = searchText(item({}), now);
    expect(matchesQuery(hayS, "favorite place")).toBe(true);
    expect(matchesQuery(hayS, "personal")).toBe(true);
  });
  it("matches everything for an empty query", () => {
    expect(matchesQuery(hay, "   ")).toBe(true);
  });
});

describe("filters", () => {
  it("filters by type", () => {
    expect(matchesFilters(item({ kind: "rewind" }), { ...NO_FILTERS, kind: "rewind" }, now)).toBe(true);
    expect(matchesFilters(item({}), { ...NO_FILTERS, kind: "rewind" }, now)).toBe(false);
  });
  it("filters keepsakes and status", () => {
    expect(matchesFilters(item({ keepsake: true }), { ...NO_FILTERS, status: "keepsake" }, now)).toBe(true);
    expect(matchesFilters(item({}), { ...NO_FILTERS, status: "keepsake" }, now)).toBe(false);
    expect(matchesFilters(item({ status: "error" }), { ...NO_FILTERS, status: "error" }, now)).toBe(true);
  });
  it("filters by topic and length", () => {
    expect(matchesFilters(item({}), { ...NO_FILTERS, category: "Work" }, now)).toBe(false);
    expect(matchesFilters(item({ category: null }), { ...NO_FILTERS, category: "Personal" }, now)).toBe(false);
    expect(matchesFilters(item({ durationSeconds: 300 }), { ...NO_FILTERS, duration: "long" }, now)).toBe(true);
  });
  it("filters by date in local days", () => {
    const sixDaysAgo = new Date(2026, 9, 16, 0, 30).toISOString();
    const eightDaysAgo = new Date(2026, 9, 14, 23, 0).toISOString();
    expect(inDateRange(sixDaysAgo, "week", now)).toBe(true);
    expect(inDateRange(eightDaysAgo, "week", now)).toBe(false);
    expect(inDateRange(eightDaysAgo, "month", now)).toBe(true);
    expect(inDateRange(eightDaysAgo, "all", now)).toBe(true);
  });
  it("knows when any filter is on", () => {
    expect(hasFilters(NO_FILTERS)).toBe(false);
    expect(hasFilters({ ...NO_FILTERS, date: "week" })).toBe(true);
  });
});

describe("kindOptions", () => {
  it("offers only the types you have, and nothing for one type", () => {
    expect(kindOptions([item({})])).toEqual([]);
    expect(kindOptions([item({}), item({ kind: "rewind" })]).map((o) => o.key)).toEqual(["all", "impromptu", "rewind"]);
  });
});

describe("transcriptExcerpt", () => {
  const said = "This morning I walked the dog all the way down to the Ferry Building and then I had a coffee with Sam before work";
  it("shows the words around a match", () => {
    const out = transcriptExcerpt(said, "ferry")!;
    expect(out).toContain("Ferry Building");
    expect(out.startsWith("…")).toBe(true);
    expect(out.endsWith("…")).toBe(true);
  });
  it("starts at the beginning when the match is early", () => {
    expect(transcriptExcerpt(said, "morning")!.startsWith("This morning")).toBe(true);
  });
  it("is null when only the prompt or date matched", () => {
    expect(transcriptExcerpt(said, "monday")).toBeNull();
    expect(transcriptExcerpt("", "dog")).toBeNull();
    expect(transcriptExcerpt(said, " ")).toBeNull();
  });
});

describe("sortNewestFirst", () => {
  it("merges two lists newest first", () => {
    const a = item({ key: "a", recordedAt: "2026-10-20T10:00:00.000Z" });
    const b = item({ key: "b", recordedAt: "2026-10-21T10:00:00.000Z" });
    const c = item({ key: "c", recordedAt: "2026-10-19T10:00:00.000Z" });
    expect(sortNewestFirst([a, c, b]).map((i) => i.key)).toEqual(["b", "a", "c"]);
  });
});
