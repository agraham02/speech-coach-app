import { getDatabase } from "./database";
import { getDrillLevel } from "./progressRepo";
import { legacyLevelFromDifficulty } from "../../domain/mastery";
import { rowToCurriculumState, type CurriculumStateRow } from "./mappers";
import {
  DEFAULT_CURRICULUM_LEVEL,
  type CurriculumComponent,
  type CurriculumDecision,
  type CurriculumLevel,
} from "../../domain/curriculum";
import {
  getCurriculumAutoLevel,
  getCurriculumOverride,
  setCurriculumAutoLevel,
  setCurriculumOverride,
} from "../prefs/prefsStore";
import type { CurriculumStateEntry } from "../../domain/sessionTypes";

// Finished impromptu takes (not scripts or feeling reps), for the checkpoint
// each curriculum_state row keeps. Deleted takes don't count.
export async function countImpromptuTakes(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM sessions WHERE status = 'done' AND deleted_at IS NULL AND session_type NOT IN ('script_practice', 'feeling')`,
  );
  return row?.n ?? 0;
}

export async function getCurrentCurriculumState(): Promise<CurriculumStateEntry | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<CurriculumStateRow>(`SELECT * FROM curriculum_state ORDER BY changed_at DESC LIMIT 1`);
  return row ? rowToCurriculumState(row) : null;
}

interface NewCurriculumStateChange {
  level: CurriculumLevel;
  direction: "up" | "down" | "initial";
  spontaneousComposite: number | null;
  drillComposite: number | null;
  spontaneousSessionCount: number;
  reasonCode: CurriculumComponent | "initial";
}

export async function insertCurriculumStateChange(input: NewCurriculumStateChange): Promise<void> {
  const db = await getDatabase();
  const changedAt = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO curriculum_state (changed_at, level, direction, spontaneous_composite, drill_composite, spontaneous_session_count, reason_code)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [changedAt, input.level, input.direction, input.spontaneousComposite, input.drillComposite, input.spontaneousSessionCount, input.reasonCode],
  );
}

export async function getCurriculumHistory(limit = 20): Promise<CurriculumStateEntry[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<CurriculumStateRow>(`SELECT * FROM curriculum_state ORDER BY changed_at DESC LIMIT ?`, [limit]);
  return rows.map(rowToCurriculumState);
}

export interface CurriculumEvaluationResult extends CurriculumDecision {
  changed: boolean;
}

// THE single entry point that keeps the practice step current: reads the
// impromptu rep staircase and, only on an actual change, writes a new
// curriculum_state row.
// Always refreshes the cheap sync-readable cache (prefsStore's
// curriculumAutoLevel) regardless of whether an override is active, so the
// auto value stays current for whenever the override is cleared (see
// getEffectiveCurriculumLevel() below). Call this from a screen's focus
// effect (Home, Trends, Curriculum) — cheap enough to call on every focus,
// and idempotent when nothing has changed.
export async function recomputeCurriculumLevel(): Promise<CurriculumEvaluationResult> {
  const [currentState, totalTakes] = await Promise.all([getCurrentCurriculumState(), countImpromptuTakes()]);

  // First-ever run — lazily seed a baseline row at the default level so
  // future cooldown counting has a checkpoint to count new sessions from.
  if (!currentState) {
    const totalSpontaneous = totalTakes;
    await insertCurriculumStateChange({
      level: DEFAULT_CURRICULUM_LEVEL,
      direction: "initial",
      spontaneousComposite: null,
      drillComposite: null,
      spontaneousSessionCount: totalSpontaneous,
      reasonCode: "initial",
    });
    setCurriculumAutoLevel(DEFAULT_CURRICULUM_LEVEL);
    return {
      level: DEFAULT_CURRICULUM_LEVEL,
      direction: "initial",
      component: null,
      componentScore: null,
      reason: "changed",
      spontaneousComposite: null,
      drillComposite: null,
      spontaneousSessionCount: totalSpontaneous,
      changed: true,
    };
  }

  // Curriculum v2: the 1-5 level (prompt tier, rep length, prep) now
  // follows the adaptive difficulty of impromptu reps, which moves with
  // on-device measurements on a staircase (see mastery.ts) — no cloud
  // grading needed, and no unreachable thresholds.
  const repLevel = legacyLevelFromDifficulty(await getDrillLevel("rep"));
  const current = currentState.level as CurriculumLevel;
  const decision: CurriculumDecision = {
    level: repLevel,
    direction: repLevel > current ? "up" : repLevel < current ? "down" : "none",
    component: null,
    componentScore: null,
    reason: repLevel !== current ? "changed" : "stable",
    spontaneousComposite: null,
    drillComposite: null,
    spontaneousSessionCount: totalTakes,
  };

  setCurriculumAutoLevel(decision.level);

  if (decision.level !== currentState.level && (decision.direction === "up" || decision.direction === "down")) {
    await insertCurriculumStateChange({
      level: decision.level,
      direction: decision.direction,
      spontaneousComposite: decision.spontaneousComposite,
      drillComposite: decision.drillComposite,
      spontaneousSessionCount: decision.spontaneousSessionCount,
      reasonCode: decision.component ?? "overall",
    });
    return { ...decision, changed: true };
  }

  return { ...decision, changed: false };
}

// Wipes curriculum_state entirely (current level AND its change history)
// and reseeds a single 'initial' row at DEFAULT_CURRICULUM_LEVEL — for when
// the level itself needs to go back to the start (e.g. DEFAULT_CURRICULUM_LEVEL
// changed, or someone just wants a clean slate), as opposed to
// recomputeCurriculumLevel()'s normal "only seed if nothing exists yet"
// behavior. The new checkpoint is today's total impromptu take count. Also
// clears any
// manual override, since a stale pin at the old level would otherwise
// silently defeat the reset. Deliberately never touches `sessions` or
// `drill_completions` — this resets the curriculum *level*, not practice
// history or scores.
export async function resetCurriculumProgress(): Promise<void> {
  const db = await getDatabase();
  const totalSpontaneous = await countImpromptuTakes();

  await db.runAsync("DELETE FROM curriculum_state");
  await insertCurriculumStateChange({
    level: DEFAULT_CURRICULUM_LEVEL,
    direction: "initial",
    spontaneousComposite: null,
    drillComposite: null,
    spontaneousSessionCount: totalSpontaneous,
    reasonCode: "initial",
  });

  setCurriculumOverride(null);
  setCurriculumAutoLevel(DEFAULT_CURRICULUM_LEVEL);
}

// Every consumer (prompt filter, drill default, recording duration,
// warm-up scaling) reads only this — guarantees a manual override is
// respected everywhere at once, never forgotten on one surface. Fully
// synchronous (two cheap MMKV reads) so it's safe to call from a
// component's render or a useState lazy initializer.
export function getEffectiveCurriculumLevel(): { level: CurriculumLevel; source: "manual" | "auto" } {
  const override = getCurriculumOverride();
  if (override !== null) return { level: override as CurriculumLevel, source: "manual" };
  return { level: getCurriculumAutoLevel() as CurriculumLevel, source: "auto" };
}
