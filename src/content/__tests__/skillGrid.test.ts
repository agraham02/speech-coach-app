import { GRID_ROWS, GRID_WEIGHTS, LESSON_TARGETS, TARGET_MULTIPLIER, effectiveWeight, getGridRow, unitTargetLeaf, type LeafMove } from "../skillGrid";
import { ACTIVITIES, ACTIVITY_IDS, activityIdOfStep, drillActivityId, guidedActivityId, warmupActivityId } from "../activities";
import { GUIDED, LESSONS, UNITS } from "../lessons";
import { WARM_UPS } from "../drillContent";
import { DRILL_TITLES, type DrillType } from "../../domain/drills/drillSpecs";
import { LEAVES, type LeafId } from "../../domain/scoring/skillTree";

// Coverage (docs/overhaul/PLAN.md, section 16): every activity, lesson step and
// leaf is in the grid, so coverage can't drift. That the rows say what the plan
// says is in overhaulPlan.test.ts.

const leavesOf = (activityId: string) => (getGridRow(activityId)?.moves ?? []).map((m) => m.leaf);
const moveOf = (activityId: string, leaf: LeafId) => getGridRow(activityId)?.moves.find((m) => m.leaf === leaf);

describe("grid coverage", () => {
  it("has a row for every activity in the catalogue", () => {
    expect(ACTIVITIES.filter((a) => !getGridRow(a.id)).map((a) => a.id)).toEqual([]);
  });

  it("has no row for an activity the catalogue doesn't know", () => {
    const known = new Set(ACTIVITIES.map((a) => a.id));
    expect(GRID_ROWS.filter((r) => !known.has(r.activityId)).map((r) => r.activityId)).toEqual([]);
  });

  it("has one row per activity", () => {
    const ids = GRID_ROWS.map((r) => r.activityId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has every drill type, guided exercise and warm-up", () => {
    const drills = (Object.keys(DRILL_TITLES) as DrillType[]).filter((d) => d !== "guided" && d !== "warmup" && d !== "rep");
    for (const d of drills) expect([d, !!getGridRow(drillActivityId(d))]).toEqual([d, true]);
    for (const g of GUIDED) expect([g.id, !!getGridRow(guidedActivityId(g.id))]).toEqual([g.id, true]);
    for (const w of WARM_UPS) expect([w.id, !!getGridRow(warmupActivityId(w.id))]).toEqual([w.id, true]);
  });

  it("has every step of every lesson, and each step can move something", () => {
    for (const lesson of LESSONS) {
      for (const step of lesson.steps) {
        const row = getGridRow(activityIdOfStep(step));
        expect({ lesson: lesson.id, step: step.kind, moves: (row?.moves.length ?? 0) > 0 }).toEqual({ lesson: lesson.id, step: step.kind, moves: true });
      }
    }
  });

  it("gives every leaf a source", () => {
    const fed = new Set(GRID_ROWS.flatMap((r) => r.moves.map((m) => m.leaf)));
    expect(LEAVES.filter((l) => !fed.has(l.id)).map((l) => l.id)).toEqual([]);
  });

  it("gives every activity a number", () => {
    for (const a of ACTIVITIES) expect([a.id, (getGridRow(a.id)?.number ?? "").length > 0]).toEqual([a.id, true]);
  });

  it("only lets a row move nothing when its leaves come from elsewhere", () => {
    const empty = GRID_ROWS.filter((r) => r.moves.length === 0);
    expect(empty.map((r) => r.activityId).sort()).toEqual([ACTIVITY_IDS.checkpoint, ACTIVITY_IDS.skillCheck].sort());
    for (const r of empty) expect(r.dynamic).toBeDefined();
  });
});

describe("lessons", () => {
  it("gives each of the 71 a target leaf, and no lesson that doesn't exist", () => {
    expect(LESSONS.filter((l) => !LESSON_TARGETS[l.id]).map((l) => l.id)).toEqual([]);
    const ids = new Set(LESSONS.map((l) => l.id));
    expect(Object.keys(LESSON_TARGETS).filter((id) => !ids.has(id))).toEqual([]);
    expect(Object.keys(LESSON_TARGETS)).toHaveLength(71);
  });

  it("scores a lesson as the average of its steps, moving nothing itself", () => {
    for (const lesson of LESSONS) {
      const row = getGridRow(`lesson:${lesson.id}`);
      expect(row?.number).toBe("The average of its steps");
      expect(row?.moves).toEqual([]);
    }
  });

  it("weighs a target leaf at 1.5", () => {
    expect(TARGET_MULTIPLIER).toBe(1.5);
  });
});

describe("checkpoints", () => {
  it("has a target leaf for every unit", () => {
    expect(UNITS).toHaveLength(22);
    for (const unit of UNITS) expect([unit.id, unitTargetLeaf(unit.id) != null]).toEqual([unit.id, true]);
  });

  it("picks the commonest target in the unit", () => {
    expect(unitTargetLeaf("imp_structure")).toBe("hits_beats");
    expect(unitTargetLeaf("art_sounds")).toBe("tricky_sounds");
  });

  it("has nothing for a unit that doesn't exist", () => {
    expect(unitTargetLeaf("nope")).toBeNull();
  });
});

describe("what a take moves", () => {
  it("moves the Voice, Clarity and Presence leaves a take can measure, fully", () => {
    for (const leaf of ["speaking_rate", "rhythm", "sentence_ends", "pitch_variety", "endings_fall", "stand_out_stress", "stress_right_words", "volume_carry", "ums_uhs", "like_actually", "stalls", "restarts", "on_lens", "long_lookaways", "hedges", "clear_endings", "face_movement"] as LeafId[]) {
      expect([leaf, moveOf(ACTIVITY_IDS.impromptu, leaf)?.weight]).toEqual([leaf, "main"]);
    }
  });

  it("doesn't claim what a take can't measure", () => {
    for (const leaf of ["deliberate_pauses", "pace_control", "breath_length", "where_to_stress", "read_accuracy", "tricky_sounds", "speed_clarity", "range_feelings", "within_limits", "keeps_core", "explains_why", "word_retrieval", "word_links", "story", "feeling_words"] as LeafId[]) {
      expect([leaf, leavesOf(ACTIVITY_IDS.impromptu).includes(leaf)]).toEqual([leaf, false]);
    }
  });

  it("counts Starting fast only with no prep", () => {
    expect(moveOf(ACTIVITY_IDS.impromptu, "starting_fast")?.only).toBe("no_prep");
  });

  it("adds the limits for a Concise take", () => {
    expect(moveOf(ACTIVITY_IDS.concise, "within_limits")?.weight).toBe("main");
    expect(moveOf(ACTIVITY_IDS.concise, "point_first")?.weight).toBe("main");
    expect(leavesOf(ACTIVITY_IDS.impromptu)).not.toContain("within_limits");
  });

  it("gives Free record Answers the question only with a topic", () => {
    expect(moveOf(ACTIVITY_IDS.freeRecord, "answers_question")?.only).toBe("has_topic");
    expect(moveOf(ACTIVITY_IDS.freeRecord, "ideas_connect")?.only).toBeUndefined();
  });

  it("gives a script no Message and nothing that reads the words", () => {
    const script = leavesOf(ACTIVITY_IDS.script);
    const message = LEAVES.filter((l) => l.pillarId === "message").map((l) => l.id);
    expect(script.filter((l) => message.includes(l))).toEqual([]);
    expect(script).not.toContain("hedges");
    expect(script).not.toContain("clear_endings");
    expect(moveOf(ACTIVITY_IDS.script, "read_accuracy")?.weight).toBe("main");
    expect(moveOf(ACTIVITY_IDS.script, "speaking_rate")?.weight).toBe("main");
    expect(moveOf(ACTIVITY_IDS.script, "ums_uhs")?.weight).toBe("partial");
    expect(moveOf(ACTIVITY_IDS.script, "on_lens")?.weight).toBe("partial");
  });

  it("doesn't move anything from the skill check: it sets starting values", () => {
    expect(getGridRow(ACTIVITY_IDS.skillCheck)).toMatchObject({ moves: [], dynamic: "seeds_starting_values" });
  });
});

describe("what a move is worth", () => {
  const move = (leaf: LeafId, weight: LeafMove["weight"]): LeafMove => ({ leaf, weight });

  it("uses the plan's dots", () => {
    expect(GRID_WEIGHTS).toEqual({ main: 1, partial: 0.5, light: 0.25 });
    expect(effectiveWeight(move("speaking_rate", "main"), "measured")).toBe(1);
    expect(effectiveWeight(move("speaking_rate", "partial"), "measured")).toBe(0.5);
    expect(effectiveWeight(move("speaking_rate", "light"), "measured")).toBe(0.25);
  });

  it("moves a content leaf lightly from a phone estimate and fully from a judge", () => {
    expect(effectiveWeight(move("answers_question", "main"), "phone_estimate")).toBe(0.25);
    expect(effectiveWeight(move("answers_question", "main"), "judge")).toBe(1);
    expect(effectiveWeight(move("word_links", "main"), "phone_estimate")).toBe(0.25);
  });

  it("leaves a delivery leaf alone whoever checked it", () => {
    expect(effectiveWeight(move("within_limits", "main"), "phone_estimate")).toBe(1);
    expect(effectiveWeight(move("speaking_rate", "main"), "phone_estimate")).toBe(1);
  });

  it("never raises a light move", () => {
    expect(effectiveWeight(move("has_shape", "light"), "phone_estimate")).toBe(0.25);
  });

  it("gives a display-only move nothing", () => {
    expect(effectiveWeight({ leaf: "felt_measured", weight: "light", displayOnly: true }, "measured")).toBe(0);
  });
});
