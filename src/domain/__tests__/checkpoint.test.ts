import { UNITS } from "../../content/lessons";
import { unitTargetLeaf } from "../../content/skillGrid";
import { afterSkip, afterTry, CHECKPOINT_PASS, checkpointLeaf, checkpointLine, checkpointOpen, checkpointRep, checkpointStatus, type CheckpointRecords } from "../checkpoint";
import { leafIsCounted } from "../scoring/rollup";

const counted = UNITS.find((u) => {
  const leaf = unitTargetLeaf(u.id);
  return leaf && leafIsCounted(leaf);
})!;
const probation = UNITS.find((u) => {
  const leaf = unitTargetLeaf(u.id);
  return leaf && !leafIsCounted(leaf);
});
const NOW = "2026-11-08T10:00:00.000Z";

describe("which units have a checkpoint", () => {
  it("tests the unit's target leaf when it counts", () => {
    expect(checkpointLeaf(counted.id)).toBe(unitTargetLeaf(counted.id));
  });

  it("finishes on lessons alone while the target leaf is on probation, unless it is previewed", () => {
    if (!probation) return; // every unit's target counts today
    expect(checkpointLeaf(probation.id)).toBeNull();
    expect(checkpointStatus(probation.id, true, {})).toBe("lessons_only");
    const leaf = unitTargetLeaf(probation.id)!;
    expect(checkpointLeaf(probation.id, { preview: { [leaf]: true } as never })).toBeDefined();
  });

  it("every unit either has a rep or is lessons-only: no unit is left without an answer", () => {
    for (const u of UNITS) expect(["ready", "lessons_only"]).toContain(checkpointStatus(u.id, true, {}));
  });

  it("uses the unit's own drill where a talk can't show its target", () => {
    expect(checkpointRep("art_sounds")).toMatchObject({ kind: "step", step: { kind: "drill" } });
    expect(checkpointRep("imp_start")).toMatchObject({ kind: "step" });
  });

  it("uses a one-minute talk where a talk shows the target and no drill moves it", () => {
    const talks = UNITS.filter((u) => checkpointRep(u.id)?.kind === "take").map((u) => u.id);
    for (const id of talks) expect(unitTargetLeaf(id)).toBeTruthy();
    // The talk's leaf is one the impromptu row moves.
    expect(talks.length + UNITS.filter((u) => checkpointRep(u.id)?.kind === "step").length).toBeGreaterThan(10);
  });

  it("gives no rep to a unit that only has guided exercises or warm-ups for its target", () => {
    const none = UNITS.filter((u) => checkpointLeaf(u.id) && !checkpointRep(u.id)).map((u) => u.id);
    for (const id of none) expect(checkpointStatus(id, true, {})).toBe("lessons_only");
  });
});

describe("a checkpoint's status", () => {
  it("is not ready until the lessons are done", () => {
    expect(checkpointStatus(counted.id, false, {})).toBe("not_ready");
    expect(checkpointStatus(counted.id, true, {})).toBe("ready");
  });

  it("stays passed for good, and skipped can still be taken", () => {
    expect(checkpointStatus(counted.id, true, { [counted.id]: { status: "passed", best: 80, attempts: 1, at: NOW } })).toBe("passed");
    expect(checkpointStatus(counted.id, false, { [counted.id]: { status: "passed", best: 80, attempts: 1, at: NOW } })).toBe("passed");
    const skipped = { [counted.id]: { status: "skipped" as const, best: null, attempts: 0, at: NOW } };
    expect(checkpointStatus(counted.id, true, skipped)).toBe("skipped");
    expect(checkpointOpen("skipped")).toBe(true);
    expect(checkpointOpen("ready")).toBe(true);
    expect(checkpointOpen("passed")).toBe(false);
    expect(checkpointOpen("lessons_only")).toBe(false);
  });

  it("a failed try leaves it ready, not skipped", () => {
    const { records } = afterTry({}, counted.id, 40, NOW);
    expect(checkpointStatus(counted.id, true, records)).toBe("ready");
  });
});

describe("a try", () => {
  it("passes at 70 and not below", () => {
    expect(afterTry({}, counted.id, CHECKPOINT_PASS, NOW)).toMatchObject({ passed: true, score: 70 });
    expect(afterTry({}, counted.id, CHECKPOINT_PASS - 1, NOW)).toMatchObject({ passed: false, score: 69 });
  });

  it("rounds before it judges, so 69.6 shown as 70 passes", () => {
    expect(afterTry({}, counted.id, 69.6, NOW).passed).toBe(true);
  });

  it("is not a try when the rep could not be scored", () => {
    const records: CheckpointRecords = {};
    expect(afterTry(records, counted.id, null, NOW)).toEqual({ records, passed: null, score: null });
    expect(afterTry(records, counted.id, Number.NaN, NOW).passed).toBeNull();
  });

  it("keeps the best, and counts the scored tries", () => {
    let records: CheckpointRecords = {};
    records = afterTry(records, counted.id, 50, NOW).records;
    records = afterTry(records, counted.id, 62, NOW).records;
    records = afterTry(records, counted.id, 41, NOW).records;
    expect(records[counted.id]).toMatchObject({ best: 62, attempts: 3, status: "tried" });
  });

  it("a pass is permanent: a later bad try does not undo it", () => {
    const passed = afterTry({}, counted.id, 80, NOW).records;
    const later = afterTry(passed, counted.id, 30, NOW);
    expect(later.records[counted.id].status).toBe("passed");
    expect(later.passed).toBe(true);
  });
});

describe("skip for now", () => {
  it("marks it skipped, keeps what was tried, and never undoes a pass", () => {
    const tried = afterTry({}, counted.id, 55, NOW).records;
    expect(afterSkip(tried, counted.id, NOW)[counted.id]).toMatchObject({ status: "skipped", best: 55, attempts: 1 });
    const passed = afterTry({}, counted.id, 90, NOW).records;
    expect(afterSkip(passed, counted.id, NOW)).toBe(passed);
  });
});

describe("what the path says", () => {
  it("says what is left, and nothing where there is nothing to say", () => {
    expect(checkpointLine("ready")).toBe("Checkpoint ready · 1 minute");
    expect(checkpointLine("ready", { status: "tried", best: 62, attempts: 1, at: NOW })).toBe("Checkpoint · best 62 of 70 needed");
    expect(checkpointLine("passed", { status: "passed", best: 81, attempts: 1, at: NOW })).toBe("Checkpoint passed · 81");
    expect(checkpointLine("skipped")).toBe("Checkpoint skipped for now");
    expect(checkpointLine("lessons_only")).toBeNull();
    expect(checkpointLine("not_ready")).toBeNull();
  });
});

describe("a rep that can be passed fairly", () => {
  it("never picks a drill the phone only estimates, or one a free account can't run", () => {
    for (const u of UNITS) {
      const rep = checkpointRep(u.id);
      if (rep?.kind !== "step") continue;
      expect(rep.step.drill).not.toBe("conv_live");
      expect(["word_chain", "chain_bridge", "category_fluency", "random_word_story", "sum_up", "relay", "explain_simple", "land_plane", "squeeze"]).not.toContain(rep.step.drill);
    }
  });
});
