import { LESSONS } from "../lessons";
import { SOURCE_GROUPS } from "../sources";

const all = SOURCE_GROUPS.flatMap((g) => g.sources);
const plain = (s: string) => s.toLowerCase().replace(/[-–—*]/g, " ").replace(/\s+/g, " ");
const haystack = plain(all.map((s) => `${s.citation} ${s.usedFor}`).join(" "));

// Names and practices a lesson's `source` line can point at. Each one must
// also appear in the Sources list, so a lesson never credits something
// Learn → Frameworks → Sources doesn't show.
const KEYS = [
  "giang", "toastmasters", "abrahams", "brooks", "van edwards", "huang", "boothby", "stivers", "clark", "eysenck",
  "hall", "krahmer", "pouw", "laban", "ladefoged", "schmidt", "johnstone", "tagalidou", "foote", "blankenship",
  "balban", "wells", "tricolon", "bottom line up front", "just a minute", "verbal fluency", "script marking",
  "speaking coach", "warm up", "hoit", "linklater", "winkworth", "provine", "mancuso", "cunningham", "mastroianni", "behavioral interview",
  "olson", "logline", "fiorella", "feynman",
];

describe("sources", () => {
  it("lists each source once, with https links", () => {
    const citations = all.map((s) => s.citation);
    expect(new Set(citations).size).toBe(citations.length);
    for (const s of all) if (s.url) expect(s.url).toMatch(/^https:\/\//);
  });

  it("covers every lesson's credit", () => {
    for (const key of KEYS) expect(haystack).toContain(key);
    const uncovered = LESSONS.filter((l) => !KEYS.some((k) => plain(l.teach.source).includes(k))).map((l) => `${l.title}: ${l.teach.source}`);
    expect(uncovered).toEqual([]);
  });
});
