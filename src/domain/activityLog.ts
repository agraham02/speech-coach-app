import { activityIdOfStep, activitySatisfies, ACTIVITY_IDS, variantOfStep } from "../content/activities";
import type { LessonStep } from "../content/lessons";

// What the activity log means (docs/overhaul/PLAN.md, section 5.2). Every
// check mark in the app is a question asked of the log:
//
// - A plan step is done when its activity was done anywhere that day, or when
//   it was done from that very step, or when the person skipped it.
// - A lesson step is done when an entry names it (the entry carries the lesson
//   and the step's position). That is kept across days, and starts over after
//   the lesson is completed, so a spaced review asks for the steps again.
// - A lesson is complete when every one of its steps is done; its score is the
//   average of the steps' real scores.
//
// All of it is pure: the repo hands over entries, this decides.

export type ActivityOutcome = "done" | "skipped";

export interface ActivityEntry {
  id: string;
  activityId: string;
  kind: string;
  variant: string | null;
  outcome: ActivityOutcome;
  at: string; // ISO, UTC
  localDate: string; // YYYY-MM-DD, on the phone
  score: number | null; // 0-1 when the activity was scored
  sessionId: string | null;
  planDate: string | null;
  planSlot: number | null; // null or 0 = the daily plan; 1-2 = a top-up
  planStepId: string | null;
  lessonId: string | null;
  lessonStepIndex: number | null;
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export interface PlanStepRef {
  id: string;
  kind: string;
  lessonStep?: LessonStep;
}

export interface PlanRef {
  date: string;
  slot: number; // 0 = the daily plan
  steps: PlanStepRef[];
}

// The activity a plan step asks for. A "review" step is the quick review of a
// take; every other step is built from a lesson step.
export function wantedByPlanStep(step: PlanStepRef): { activityId: string; variant: string | null } | null {
  if (step.kind === "review") return { activityId: ACTIVITY_IDS.review, variant: null };
  if (!step.lessonStep) return null;
  return { activityId: activityIdOfStep(step.lessonStep), variant: variantOfStep(step.lessonStep) };
}

// Which steps of each plan are done, given everything logged on that day.
//
// An entry made from a plan step belongs to that step (and only that plan). An
// entry made anywhere else (Practice, a lesson) is free: it ticks the first
// open step that asks for the same activity, in the daily plan first, then the
// top-ups, and ticks only one. So two rep steps need two reps, and a rep done
// for the top-up is not also counted for the daily plan.
export function doneStepsByPlan(plans: PlanRef[], entries: ActivityEntry[]): Record<number, Set<string>> {
  const result: Record<number, Set<string>> = {};
  const used = new Set<string>();
  const ordered = [...plans].sort((a, b) => a.slot - b.slot);

  for (const plan of ordered) {
    const done = new Set<string>();
    result[plan.slot] = done;
    const stepIds = new Set(plan.steps.map((s) => s.id));
    for (const e of entries) {
      if (e.planDate !== plan.date || (e.planSlot ?? 0) !== plan.slot || e.planStepId == null) continue;
      if (stepIds.has(e.planStepId)) {
        done.add(e.planStepId);
        used.add(e.id);
      }
    }
  }

  for (const plan of ordered) {
    const done = result[plan.slot];
    for (const step of plan.steps) {
      if (done.has(step.id)) continue;
      const wanted = wantedByPlanStep(step);
      if (!wanted) continue;
      const match = entries.find(
        (e) =>
          e.outcome === "done" &&
          e.localDate === plan.date &&
          e.planStepId == null &&
          !used.has(e.id) &&
          activitySatisfies({ activityId: e.activityId, variant: e.variant }, wanted),
      );
      if (match) {
        used.add(match.id);
        done.add(step.id);
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

export interface LessonProgress {
  // Positions of the steps done in the current go at the lesson.
  done: Set<number>;
  // The latest real score of each done step (null when it wasn't scored).
  scores: Map<number, number | null>;
}

// `since` is when the lesson was last completed: a review starts from nothing.
export function lessonProgress(lessonId: string, entries: ActivityEntry[], since: string | null): LessonProgress {
  const done = new Set<number>();
  const scores = new Map<number, number | null>();
  const mine = entries
    .filter((e) => e.lessonId === lessonId && e.lessonStepIndex != null && e.outcome === "done" && (since == null || e.at > since))
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  for (const e of mine) {
    const index = e.lessonStepIndex!;
    done.add(index);
    // A later try with a score replaces an earlier one; a later try without
    // one (a take that is still being judged) keeps what was there.
    if (e.score != null || !scores.has(index)) scores.set(index, e.score);
  }
  return { done, scores };
}

export function lessonIsComplete(stepCount: number, progress: LessonProgress): boolean {
  if (stepCount === 0) return false;
  for (let i = 0; i < stepCount; i++) if (!progress.done.has(i)) return false;
  return true;
}

// The real average of the scored steps, or null when none was scored. An
// unscored step (a take, a reading) neither raises nor lowers it.
export function lessonScore(stepCount: number, progress: LessonProgress): number | null {
  const scored: number[] = [];
  for (let i = 0; i < stepCount; i++) {
    const s = progress.scores.get(i);
    if (s != null) scored.push(s);
  }
  return scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null;
}

// Which step of a lesson an activity counts for: the first open step that asks
// for it. Null when the lesson has none (or they are all done).
export function openStepFor(steps: LessonStep[], done: Set<number>, logged: { activityId: string; variant: string | null }): number | null {
  for (let i = 0; i < steps.length; i++) {
    if (done.has(i)) continue;
    const step = steps[i];
    if (activitySatisfies(logged, { activityId: activityIdOfStep(step), variant: variantOfStep(step) })) return i;
  }
  return null;
}
