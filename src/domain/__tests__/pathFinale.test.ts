import { describeFinale, FINALE_QUOTE, isPathComplete } from "../pathFinale";
import { FURTHER_READING, FURTHER_READING_NOTE } from "../../content/furtherReading";
import { SOURCE_GROUPS } from "../../content/sources";

describe("isPathComplete", () => {
  it("is true once nothing is active or upcoming", () => {
    expect(isPathComplete([{ status: "done" }, { status: "done" }, { status: "tested_out" }])).toBe(true);
  });
  it("is false while a unit is still on the go or to come", () => {
    expect(isPathComplete([{ status: "done" }, { status: "active" }])).toBe(false);
    expect(isPathComplete([{ status: "done" }, { status: "upcoming" }])).toBe(false);
  });
  it("needs at least one unit actually finished", () => {
    expect(isPathComplete([{ status: "tested_out" }])).toBe(false);
    expect(isPathComplete([])).toBe(false);
  });
});

describe("describeFinale", () => {
  it("counts units and lessons", () => {
    expect(describeFinale({ units: 22, lessons: 70, shown: 0, speakerLevel: 9 })).toBe("22 units and 70 lessons.");
  });
  it("mentions what the skill check covered", () => {
    expect(describeFinale({ units: 20, lessons: 64, shown: 1, speakerLevel: null })).toBe("20 units and 64 lessons, plus 1 unit your skill check showed you had already.");
  });
  it("has a quote with an attribution", () => {
    expect(FINALE_QUOTE.text.length).toBeGreaterThan(10);
    expect(FINALE_QUOTE.attribution).toMatch(/Seneca/);
  });
});

describe("further reading", () => {
  const groups = SOURCE_GROUPS.filter((g) => g.title === "Books" || g.title.startsWith("Coaches"));
  const citations = groups.flatMap((g) => g.sources.map((s) => s.citation));
  const allUrls = new Set(SOURCE_GROUPS.flatMap((g) => g.sources.map((s) => s.url)).filter(Boolean));

  it("only lists books and coaches the curriculum already cites, never research", () => {
    expect(groups).toHaveLength(2);
    for (const item of FURTHER_READING) {
      expect(citations.some((c) => c.includes(item.title))).toBe(true);
    }
  });
  it("links only to a site already in the sources (no shop or affiliate links)", () => {
    for (const item of FURTHER_READING) {
      if (!item.url) continue;
      expect(allUrls.has(item.url)).toBe(true);
      expect(item.url).not.toMatch(/amazon\.|amzn\.|bookshop\.org|[?&](tag|ref|aff|affiliate)=/i);
    }
  });
  it("says there is no tie to any of them", () => {
    expect(FURTHER_READING_NOTE).toMatch(/no tie/);
  });
});
