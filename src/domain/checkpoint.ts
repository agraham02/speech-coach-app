import { ACTIVITY_IDS, activityIdOfStep } from "../content/activities";
import { lessonsInUnit, type LessonStep } from "../content/lessons";
import { getGridRow, unitTargetLeaf } from "../content/skillGrid";
import { leafIsCounted, type CountOptions } from "./scoring/rollup";
import type { LeafId } from "./scoring/skillTree";

// Checkpoints (docs/overhaul/PLAN.md, 5.1 and the "Checkpoint" row of section 7):
// once per unit, a one-minute rep that tests what most of the unit's lessons
// aim at (its target leaf). Pass at 70. You can retry, or skip for now. A unit
// whose target leaf isn't counted yet (on probation) finishes on lessons alone.
// Pure.

export const CHECKPOINT_PASS = 70;
export const CHECKPOINT_SECONDS = 60;
// A little time to think, as a lesson's rep has.
export const CHECKPOINT_PREP_SECONDS = 15;

export type CheckpointStatus =
  | "not_ready" // lessons left in the unit
  | "ready" // the lessons are done and the checkpoint hasn't been passed or skipped
  | "passed"
  | "skipped" // skipped for now; it can still be taken
  | "lessons_only"; // the unit's target leaf doesn't count yet, so there is nothing to test

export interface CheckpointRecord {
  status: "passed" | "skipped" | "tried";
  // The best score on the target leaf, 0 to 100, from any try.
  best: number | null;
  // Tries that were scored.
  attempts: number;
  at: string;
}

export type CheckpointRecords = Record<string, CheckpointRecord>;

// The leaf a unit's checkpoint tests, or null when it has none that counts.
export function checkpointLeaf(unitId: string, options: CountOptions = {}): LeafId | null {
  const leaf = unitTargetLeaf(unitId);
  return leaf && leafIsCounted(leaf, options) ? leaf : null;
}

// What the rep is. Most units' target leaves (Tricky sounds, Word retrieval, Settling)
// are not something a talk shows, so the rep is the unit's own drill that moves that
// leaf, run once and passed at 70 on its own number; a unit whose target a talk does
// show (Speaking rate, Hits the beats, On the lens) gets a one-minute talk, scored on
// that leaf. Guided exercises and warm-ups have no number until 3c, so a unit that
// only has those finishes on lessons alone for now.
export type CheckpointRep = { kind: "take" } | { kind: "step"; step: Extract<LessonStep, { kind: "drill" }> };

export function checkpointRep(unitId: string, options: CountOptions = {}): CheckpointRep | null {
  const leaf = checkpointLeaf(unitId, options);
  if (!leaf) return null;
  const lessons = lessonsInUnit(unitId);
  for (const lesson of [...lessons].reverse()) {
    for (const step of [...lesson.steps].reverse()) {
      if (step.kind !== "drill") continue;
      const row = getGridRow(activityIdOfStep(step));
      if (row?.moves.some((m) => m.leaf === leaf && m.weight !== "light" && !m.displayOnly)) return { kind: "step", step };
    }
  }
  return getGridRow(ACTIVITY_IDS.impromptu)?.moves.some((m) => m.leaf === leaf) ? { kind: "take" } : null;
}

export function checkpointStatus(unitId: string, lessonsDone: boolean, records: CheckpointRecords, options: CountOptions = {}): CheckpointStatus {
  if (records[unitId]?.status === "passed") return "passed";
  if (!lessonsDone) return "not_ready";
  if (!checkpointRep(unitId, options)) return "lessons_only";
  return records[unitId]?.status === "skipped" ? "skipped" : "ready";
}

// Whether a unit's checkpoint is still open for the person to take.
export function checkpointOpen(status: CheckpointStatus): boolean {
  return status === "ready" || status === "skipped";
}

export interface CheckpointTry {
  records: CheckpointRecords;
  // null: the rep couldn't be scored (the take failed its gate), so it isn't a try.
  passed: boolean | null;
  score: number | null;
}

// One scored rep. `score` is the target leaf's number from the take, 0 to 100,
// or null when the take wasn't scored. A pass is permanent; a fail leaves the
// checkpoint open to try again, and keeps the best.
export function afterTry(records: CheckpointRecords, unitId: string, score: number | null, at: string): CheckpointTry {
  if (score == null || !Number.isFinite(score)) return { records, passed: null, score: null };
  const before = records[unitId];
  if (before?.status === "passed") return { records, passed: true, score };
  const rounded = Math.round(score);
  const passed = rounded >= CHECKPOINT_PASS;
  const best = Math.max(before?.best ?? -Infinity, rounded);
  return {
    records: { ...records, [unitId]: { status: passed ? "passed" : before?.status ?? "tried", best, attempts: (before?.attempts ?? 0) + 1, at } },
    passed,
    score: rounded,
  };
}

// "Skip for now": never undoes a pass.
export function afterSkip(records: CheckpointRecords, unitId: string, at: string): CheckpointRecords {
  if (records[unitId]?.status === "passed") return records;
  return { ...records, [unitId]: { status: "skipped", best: records[unitId]?.best ?? null, attempts: records[unitId]?.attempts ?? 0, at } };
}

export function checkpointLine(status: CheckpointStatus, record?: CheckpointRecord): string | null {
  switch (status) {
    case "passed":
      return record?.best != null ? `Checkpoint passed · ${record.best}` : "Checkpoint passed";
    case "ready":
      return record?.best != null ? `Checkpoint · best ${record.best} of ${CHECKPOINT_PASS} needed` : "Checkpoint ready · 1 minute";
    case "skipped":
      return "Checkpoint skipped for now";
    default:
      return null;
  }
}
