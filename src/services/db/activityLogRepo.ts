import { getDatabase } from "./database";
import { getActivity } from "../../content/activities";
import type { ActivityEntry, ActivityOutcome } from "../../domain/activityLog";
import { isoDateFromDate } from "../../utils/dateUtils";
import { logger } from "../../utils/logger";

// The activity log (docs/overhaul/PLAN.md, section 5.2): one row each time an
// activity is done or a plan step is skipped. What it means is in
// domain/activityLog.ts.

interface Row {
  id: string;
  activity_id: string;
  kind: string;
  variant: string | null;
  outcome: string;
  at: string;
  local_date: string;
  score: number | null;
  session_id: string | null;
  plan_date: string | null;
  plan_slot: number | null;
  plan_step_id: string | null;
  lesson_id: string | null;
  lesson_step_index: number | null;
}

function toEntry(r: Row): ActivityEntry {
  return {
    id: r.id,
    activityId: r.activity_id,
    kind: r.kind,
    variant: r.variant,
    outcome: r.outcome === "skipped" ? "skipped" : "done",
    at: r.at,
    localDate: r.local_date,
    score: r.score,
    sessionId: r.session_id,
    planDate: r.plan_date,
    planSlot: r.plan_slot,
    planStepId: r.plan_step_id,
    lessonId: r.lesson_id,
    lessonStepIndex: r.lesson_step_index,
  };
}

export interface NewActivity {
  activityId: string;
  variant?: string | null;
  outcome?: ActivityOutcome;
  score?: number | null;
  sessionId?: string | null;
  planDate?: string | null;
  planSlot?: number | null;
  planStepId?: string | null;
  lessonId?: string | null;
  lessonStepIndex?: number | null;
  // For tests; real entries are stamped now.
  at?: string;
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Writes one entry. A take that already has an entry for this activity (the
// save and the result screen both report the same rep) isn't logged twice;
// the entry already there comes back.
export async function logActivity(n: NewActivity): Promise<ActivityEntry> {
  const db = await getDatabase();
  if (n.sessionId) {
    const existing = await db.getFirstAsync<Row>(`SELECT * FROM activity_log WHERE session_id = ? AND activity_id = ? AND outcome = 'done'`, [n.sessionId, n.activityId]);
    if (existing && (n.outcome ?? "done") === "done") return toEntry(existing);
  }
  const activity = getActivity(n.activityId);
  if (!activity) logger.warn(`[activity] "${n.activityId}" is not in the catalogue`);
  const at = n.at ?? new Date().toISOString();
  const entry: ActivityEntry = {
    id: newId(),
    activityId: n.activityId,
    kind: activity?.kind ?? "drill",
    variant: n.variant ?? null,
    outcome: n.outcome ?? "done",
    at,
    localDate: isoDateFromDate(new Date(at)),
    score: n.score ?? null,
    sessionId: n.sessionId ?? null,
    planDate: n.planDate ?? null,
    planSlot: n.planSlot ?? null,
    planStepId: n.planStepId ?? null,
    lessonId: n.lessonId ?? null,
    lessonStepIndex: n.lessonStepIndex ?? null,
  };
  await db.runAsync(
    `INSERT INTO activity_log (id, activity_id, kind, variant, outcome, at, local_date, score, session_id, plan_date, plan_slot, plan_step_id, lesson_id, lesson_step_index)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.id,
      entry.activityId,
      entry.kind,
      entry.variant,
      entry.outcome,
      entry.at,
      entry.localDate,
      entry.score,
      entry.sessionId,
      entry.planDate,
      entry.planSlot,
      entry.planStepId,
      entry.lessonId,
      entry.lessonStepIndex,
    ],
  );
  return entry;
}

// Everything logged on one local day, oldest first.
export async function getEntriesOn(localDate: string): Promise<ActivityEntry[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Row>(`SELECT * FROM activity_log WHERE local_date = ? ORDER BY at`, [localDate]);
  return rows.map(toEntry);
}

// Everything logged against one lesson, oldest first.
export async function getEntriesForLesson(lessonId: string): Promise<ActivityEntry[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Row>(`SELECT * FROM activity_log WHERE lesson_id = ? ORDER BY at`, [lessonId]);
  return rows.map(toEntry);
}

// The steps done so far in each lesson's current go (after its last
// completion), for every lesson with any. The daily plan uses it to bring the
// steps still to do ahead of the ones already done.
export async function getLessonStepsDone(): Promise<Record<string, number[]>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ lesson_id: string; lesson_step_index: number }>(
    `SELECT DISTINCT a.lesson_id, a.lesson_step_index
       FROM activity_log a LEFT JOIN lesson_progress p ON p.lesson_id = a.lesson_id
      WHERE a.lesson_step_index IS NOT NULL AND a.outcome = 'done' AND (p.completed_at IS NULL OR a.at > p.completed_at)`,
  );
  const out: Record<string, number[]> = {};
  for (const r of rows) (out[r.lesson_id] ??= []).push(r.lesson_step_index);
  return out;
}
