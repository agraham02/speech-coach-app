import { LEAVES, SKILL_TREE, getLeaf, isContentLeaf, leafCounts, type LeafId } from "../skillTree";
import { READING_IDS, READINGS } from "../../signalLab/readingTrust";

// The tree's own rules (docs/overhaul/PLAN.md, 6.1 and 6.2). That it matches
// Appendix C is in overhaulPlan.test.ts.

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

// One plain shape to walk the tree with: the literal types don't need to survive here.
interface Node {
  id: string;
  weight: number;
}
const TREE = SKILL_TREE as unknown as readonly (Node & { skills: readonly (Node & { leaves: readonly Node[] })[] })[];

describe("the skill tree", () => {
  it("has 6 pillars, 26 secondary skills and 63 leaves", () => {
    expect(TREE).toHaveLength(6);
    expect(TREE.flatMap((p) => p.skills)).toHaveLength(26);
    expect(LEAVES).toHaveLength(63);
  });

  it("adds up to 100% at every node", () => {
    expect(sum(TREE.map((p) => p.weight))).toBe(100);
    for (const pillar of TREE) {
      expect([pillar.id, sum(pillar.skills.map((s) => s.weight))]).toEqual([pillar.id, 100]);
      for (const skill of pillar.skills) expect([skill.id, sum(skill.leaves.map((l) => l.weight))]).toEqual([skill.id, 100]);
    }
  });

  it("shares all of Overall between its leaves", () => {
    const share = LEAVES.map((l) => {
      const pillar = TREE.find((p) => p.id === l.pillarId)!;
      const skill = pillar.skills.find((s) => s.id === l.skillId)!;
      return (pillar.weight / 100) * (skill.weight / 100) * (l.weight / 100);
    });
    expect(sum(share)).toBeCloseTo(1, 10);
  });

  it("uses each id once across the whole tree, so a leaf has one parent", () => {
    const ids = TREE.flatMap((p) => [p.id, ...p.skills.flatMap((s) => [s.id, ...s.leaves.map((l) => l.id)])]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("knows each leaf's parents", () => {
    expect(getLeaf("word_links")).toMatchObject({ name: "Word links", skillId: "quick_thinking", pillarId: "message", weight: 30 });
    expect(getLeaf("felt_measured")).toMatchObject({ skillId: "self_view", pillarId: "composure" });
  });
});

describe("which leaves count", () => {
  const unproven = LEAVES.filter((l) => l.trust === "probation" || l.trust === "tuning");

  it("ties every Signal Lab reading to exactly one leaf", () => {
    const linked = LEAVES.flatMap((l) => (l.reading ? [l.reading] : []));
    expect([...linked].sort()).toEqual([...READING_IDS].sort());
  });

  it("gives every probation and tuning leaf a reading, except Felt vs measured", () => {
    expect(unproven.filter((l) => !l.reading).map((l) => l.id)).toEqual(["felt_measured"]);
  });

  it("follows the reading's status, not the plan's starting status", () => {
    for (const l of unproven) {
      if (!l.reading) continue;
      expect([l.id, leafCounts(l.id)]).toEqual([l.id, READINGS[l.reading].status === "now"]);
    }
    // Passed in Signal Lab (D11).
    expect(leafCounts("sentence_ends")).toBe(true);
    expect(leafCounts("on_lens")).toBe(true);
    // Still Beta (D11).
    expect(leafCounts("endings_fall")).toBe(false);
    expect(leafCounts("stress_right_words")).toBe(false);
    expect(leafCounts("face_movement")).toBe(false);
    expect(leafCounts("range_feelings")).toBe(false);
  });

  it("lets the Dev preview count a reading early", () => {
    expect(leafCounts("endings_fall", { endings_fall: true })).toBe(true);
  });

  it("never counts Felt vs measured", () => {
    expect(leafCounts("felt_measured")).toBe(false);
  });

  it("always counts what doesn't rest on a reading", () => {
    const rest: LeafId[] = LEAVES.filter((l) => l.trust !== "probation" && l.trust !== "tuning").map((l) => l.id);
    for (const id of rest) expect([id, leafCounts(id)]).toEqual([id, true]);
  });
});

describe("content leaves", () => {
  it("are the ones about meaning", () => {
    expect(isContentLeaf("answers_question")).toBe(true);
    expect(isContentLeaf("hits_beats")).toBe(true);
    expect(isContentLeaf("playfulness")).toBe(true);
    expect(isContentLeaf("speaking_rate")).toBe(false);
    expect(isContentLeaf("within_limits")).toBe(false);
    expect(isContentLeaf("nerves_trend")).toBe(false);
  });
});
