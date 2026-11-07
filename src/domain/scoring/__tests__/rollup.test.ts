import { LEAVES, SKILL_TREE, STUTTER_EXCLUDED, type LeafId } from "../skillTree";
import { buildTrail, formatDelta, leafIsCounted, moveLeaf, nodeScore, ratingOf, rollUp, trailLine, weightedAverage, type LeafRatings } from "../rollup";

// Plan 6.3 and section 16's roll-up tests.

const at = (rating: number, attempts = 0) => ({ rating, attempts });

describe("the plan's worked example", () => {
  // 80% on Word chain at difficulty 3, with Word links at 40 after 5 attempts.
  const before: LeafRatings = { word_links: at(40, 5) };
  const after: LeafRatings = { word_links: moveLeaf("word_links", at(40, 5), 0.8, 3, 1) };
  const a = rollUp(before);
  const b = rollUp(after);

  it("moves Word links from 40 to 42.4", () => {
    expect(after.word_links!.rating).toBeCloseTo(42.4, 1);
    expect(after.word_links!.attempts).toBe(6);
  });

  it("moves Quick thinking +0.7, Message +0.1, Overall +0.03", () => {
    expect(b.skills.quick_thinking! - a.skills.quick_thinking!).toBeCloseTo(0.7, 1);
    expect(b.pillars.message! - a.pillars.message!).toBeCloseTo(0.1, 1);
    expect(b.overall - a.overall).toBeCloseTo(0.03, 2);
  });

  it("reads as the plan's trail", () => {
    const trail = buildTrail(a, b, ["word_links"])!;
    expect(trailLine(trail)).toBe("Word links +2.4 · Quick thinking +0.7 · Message +0.1 · Overall +0.03");
    expect(trail.path.map((s) => s.level)).toEqual(["leaf", "skill", "pillar", "overall"]);
  });
});

describe("a leaf's move", () => {
  it("scales by the grid's weight", () => {
    const full = moveLeaf("speaking_rate", at(40, 5), 0.9, 3, 1).rating - 40;
    expect(moveLeaf("speaking_rate", at(40, 5), 0.9, 3, 0.5).rating - 40).toBeCloseTo(full / 2, 1);
    expect(moveLeaf("speaking_rate", at(40, 5), 0.9, 3, 0.25).rating - 40).toBeCloseTo(full / 4, 1);
    expect(moveLeaf("speaking_rate", at(40, 5), 0.9, 3, 1.5).rating - 40).toBeCloseTo(full * 1.5, 1);
  });

  it("counts for more at a harder difficulty", () => {
    expect(moveLeaf("speaking_rate", at(40), 0.8, 6, 1).rating).toBeGreaterThan(moveLeaf("speaking_rate", at(40), 0.8, 2, 1).rating);
  });

  it("can fall", () => {
    expect(moveLeaf("speaking_rate", at(60, 5), 0.2, 3, 1).rating).toBeLessThan(60);
  });

  it("stays between 0 and 100", () => {
    expect(moveLeaf("speaking_rate", at(99.9), 1, 10, 1).rating).toBeLessThanOrEqual(100);
    expect(moveLeaf("speaking_rate", at(0.1), 0, 1, 1).rating).toBeGreaterThanOrEqual(0);
  });

  it("never falls in Composure, and still counts the attempt", () => {
    for (const leaf of LEAVES.filter((l) => l.pillarId === "composure")) {
      const moved = moveLeaf(leaf.id, at(60, 5), 0, 3, 1);
      expect([leaf.id, moved.rating]).toEqual([leaf.id, 60]);
      expect(moved.attempts).toBe(6);
    }
    expect(moveLeaf("nerves_trend", at(30, 5), 1, 3, 1).rating).toBeGreaterThan(30);
  });
});

describe("the roll-up", () => {
  it("starts everything at 25", () => {
    const scores = rollUp({});
    expect(scores.overall).toBeCloseTo(25);
    for (const pillar of SKILL_TREE) expect(scores.pillars[pillar.id]).toBeCloseTo(25);
  });

  it("keeps an untouched leaf at its starting value, so one branch can't carry Overall", () => {
    const ratings: LeafRatings = {};
    for (const leaf of LEAVES.filter((l) => l.pillarId === "voice")) ratings[leaf.id] = at(100);
    const scores = rollUp(ratings);
    expect(scores.pillars.voice).toBeCloseTo(100);
    expect(scores.pillars.message).toBeCloseTo(25);
    expect(scores.overall).toBeCloseTo(25 + 75 * 0.2);
  });

  it("shares a leaf's weight among its siblings when it doesn't count", () => {
    // Endings that fall doesn't count yet, so Melody is Pitch variety alone.
    expect(leafIsCounted("endings_fall")).toBe(false);
    expect(leafIsCounted("pitch_variety")).toBe(true);
    const scores = rollUp({ pitch_variety: at(80), endings_fall: at(10) });
    expect(scores.skills.melody).toBeCloseTo(80);
  });

  it("counts it once previewed, by its weight", () => {
    const scores = rollUp({ pitch_variety: at(80), endings_fall: at(10) }, { preview: { endings_fall: true } });
    expect(scores.skills.melody).toBeCloseTo(80 * 0.6 + 10 * 0.4);
  });

  it("shares a whole skill's weight when nothing under it counts", () => {
    expect(weightedAverage([{ score: null, weight: 50 }, { score: 40, weight: 50 }])).toBe(40);
    expect(weightedAverage([{ score: null, weight: 50 }])).toBeNull();
    const scores = rollUp({}, { excluded: ["ums_uhs", "like_actually"] });
    expect(scores.skills.fillers).toBeNull();
    expect(scores.pillars.clarity).toBeCloseTo(25);
  });

  it("leaves Fillers and Flow out for someone who stutters", () => {
    const leaves = ["ums_uhs", "like_actually", "stalls", "restarts"] as LeafId[];
    expect([...STUTTER_EXCLUDED].sort()).toEqual([...leaves].sort());
    const ratings: LeafRatings = { ums_uhs: at(90), like_actually: at(90), stalls: at(90), restarts: at(90) };
    expect(rollUp(ratings).pillars.clarity).toBeGreaterThan(40);
    expect(rollUp(ratings, { excluded: STUTTER_EXCLUDED }).pillars.clarity).toBeCloseTo(25);
  });

  it("ignores Self-view, at 0%", () => {
    expect(rollUp({ felt_measured: at(100) }).pillars.composure).toBeCloseTo(25);
    expect(rollUp({ felt_measured: at(100) }).skills.self_view).toBeNull();
  });

  it("gets every node by id", () => {
    const scores = rollUp({ word_links: at(40) });
    expect(nodeScore(scores, "overall")).toBe(scores.overall);
    expect(nodeScore(scores, "message")).toBe(scores.pillars.message);
    expect(nodeScore(scores, "quick_thinking")).toBe(scores.skills.quick_thinking);
    expect(nodeScore(scores, "word_links")).toBe(40);
    expect(ratingOf({}, "word_links")).toEqual({ rating: 25, attempts: 0 });
  });
});

describe("the trail", () => {
  it("is nothing when nothing moved", () => {
    const scores = rollUp({ nerves_trend: at(60) });
    expect(buildTrail(scores, scores, ["nerves_trend"])).toBeNull();
  });

  it("follows the biggest move, and lists the rest", () => {
    const before = rollUp({});
    const after = rollUp({ ums_uhs: at(35), speaking_rate: at(27) });
    const trail = buildTrail(before, after, ["speaking_rate", "ums_uhs"])!;
    expect(trail.path.map((s) => s.name)).toEqual(["Ums and uhs", "Fillers", "Clarity", "Overall"]);
    expect(trail.leaves.map((s) => s.id)).toEqual(["ums_uhs", "speaking_rate"]);
    expect(trail.pillars.map((s) => s.id)).toEqual(["clarity", "voice"]);
  });

  it("shows a fall as a fall", () => {
    const trail = buildTrail(rollUp({ speaking_rate: at(40) }), rollUp({ speaking_rate: at(38) }), ["speaking_rate"])!;
    expect(trailLine(trail)).toMatch(/^Speaking rate -2\.0 · Pace -1\.0 · Voice -0\.3 · Overall -0\.06$/);
  });

  it("leaves out a step that rounds to nothing", () => {
    const trail = buildTrail(rollUp({ feeling_words: at(25) }), rollUp({ feeling_words: at(25.04) }), ["feeling_words"])!;
    expect(trailLine(trail)).not.toContain("Overall");
  });

  it("formats deltas", () => {
    expect(formatDelta({ delta: 2.36, level: "leaf" })).toBe("+2.4");
    expect(formatDelta({ delta: 0.03, level: "pillar" })).toBe("+0.03");
    expect(formatDelta({ delta: 0.027, level: "overall" })).toBe("+0.03");
    expect(formatDelta({ delta: -0.4, level: "skill" })).toBe("-0.4");
  });
});
