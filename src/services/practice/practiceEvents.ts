import type { PracticeContext } from "../../domain/practice";
import { completeLesson, getLessonStates, refreshPlanCompletion } from "../db/progressRepo";
import { getEntriesForLesson, logActivity } from "../db/activityLogRepo";
import { lessonIsComplete, lessonProgress, lessonScore, openStepFor } from "../../domain/activityLog";
import { getLesson } from "../../content/lessons";
import { syncDailyReminder } from "../notifications/reminderScheduler";
import { logger } from "../../utils/logger";
import { getCurrentLessonIds, onLessonCompleted } from "../path/pathService";

export interface PracticeStepDone {
  // What was done: an id from the catalogue (content/activities.ts).
  activityId: string;
  // Where it was started from; empty when it was started from Practice.
  context: PracticeContext;
  score: number | null; // 0-1 when the step was scored
  // Set when the step was a recording that became a session.
  sessionId?: string;
  // Set when this finished a lesson.
  lessonCompleted?: string;
}

type Listener = (event: PracticeStepDone) => void;
const listeners = new Set<Listener>();

export function subscribePracticeSteps(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface PracticeExtra {
  sessionId?: string;
  // What the activity was beyond its id: the structure a rep used.
  variant?: string | null;
}

let queue: Promise<unknown> = Promise.resolve();

// The same step reported twice within a moment (a double tap on Done, a screen
// that reports on save and again on leaving) is one step, not two.
const DUPLICATE_WINDOW_MS = 2000;
const recent = new Map<string, number>();

function isRecentDuplicate(activityId: string, context: PracticeContext | undefined, extra: PracticeExtra): boolean {
  const key = [activityId, context?.planDate, context?.planSlot, context?.planStepId, context?.lessonId, context?.lessonStepIndex, extra.sessionId, extra.variant].join("|");
  const now = Date.now();
  for (const [k, at] of recent) if (now - at > DUPLICATE_WINDOW_MS) recent.delete(k);
  if (recent.has(key)) return true;
  recent.set(key, now);
  return false;
}

// For tests: forget what was just reported.
export function forgetRecentSteps(): void {
  recent.clear();
}

// A lesson that passes needs an average of 70% on its scored steps.
const LESSON_PASS = 0.7;

// Called by every runner when its activity is finished, whether it was started
// from a plan, a lesson or Practice. It writes the activity log, which is what
// every check mark reads (docs/overhaul/PLAN.md, section 5.2), then finishes
// the lesson if that was its last step and tells whatever screen is open.
export async function completePracticeStep(activityId: string, context: PracticeContext | undefined, score: number | null, extra: PracticeExtra = {}): Promise<void> {
  let lessonCompleted: string | undefined;
  // The skill check's own samples are recorded but are not practice.
  if (!context?.placement && !isRecentDuplicate(activityId, context, extra)) {
    // One at a time: two taps on Done can't both see a lesson as one step
    // short, or finish it twice.
    const run = queue.then(() => recordActivity(activityId, context ?? {}, score, extra));
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    try {
      lessonCompleted = await run;
    } catch (error) {
      logger.error(`[practice] couldn't log ${activityId} — ${(error as Error).message}`);
    }
  }
  // A unit's checkpoint rep: the drill's own number (0 to 1) is the try.
  if (context?.checkpointUnitId) {
    // Lazy: the checkpoint service reaches for screens and toasts, which a plain
    // practice log shouldn't pull in.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { settleCheckpoint } = require("../checkpoint/checkpointService") as typeof import("../checkpoint/checkpointService");
    settleCheckpoint(context.checkpointUnitId, score == null ? null : Math.round(score * 100));
  }
  listeners.forEach((l) => l({ activityId, context: context ?? {}, score, sessionId: extra.sessionId, lessonCompleted }));
}

async function recordActivity(activityId: string, context: PracticeContext, score: number | null, extra: PracticeExtra): Promise<string | undefined> {
  const variant = extra.variant ?? null;
  const states = await getLessonStates();

  // Which lesson step this counts for. From a lesson screen it says so itself.
  // From a plan it names the lesson (and sometimes the step). From Practice it
  // counts for the first open step that asks for it in a lesson that is current
  // on your path right now, so a drill done there ticks the lesson too.
  let lessonId = context.lessonId ?? null;
  let lessonStepIndex = context.lessonStepIndex ?? null;
  // A plan step that came from the lesson names its step; one that didn't (the
  // line of the day, more of the same skill) must not tick one by accident.
  if (lessonStepIndex == null && !context.planStepId && !context.checkpointUnitId) {
    const candidates = lessonId ? [lessonId] : await getCurrentLessonIds().catch(() => [] as string[]);
    for (const id of candidates) {
      const lesson = getLesson(id);
      if (!lesson) continue;
      const progress = lessonProgress(id, await getEntriesForLesson(id), states[id]?.completedAt ?? null);
      const at = openStepFor(lesson.steps, progress.done, { activityId, variant });
      if (at != null) {
        lessonId = id;
        lessonStepIndex = at;
        break;
      }
    }
  }

  const entry = await logActivity({
    activityId,
    variant,
    score,
    sessionId: extra.sessionId,
    planDate: context.planDate ?? null,
    planSlot: context.planSlot ?? null,
    planStepId: context.planStepId ?? null,
    lessonId,
    lessonStepIndex,
  });

  // The day's plans may now be finished; that is written before the reminder
  // looks, so a finished day doesn't get a nudge. A failure here must not stop
  // the lesson check below.
  try {
    await refreshPlanCompletion(entry.planDate ?? entry.localDate);
    if (entry.planDate && entry.planDate !== entry.localDate) await refreshPlanCompletion(entry.localDate);
  } catch (error) {
    logger.error(`[practice] couldn't update the plan — ${(error as Error).message}`);
  }
  // A finished step may satisfy a reminder that's still armed.
  syncDailyReminder().catch(() => undefined);

  // The lesson is complete when every one of its steps is done in this go at
  // it. Its score is the real average of the steps that were scored.
  if (lessonId && lessonStepIndex != null) {
    const lesson = getLesson(lessonId);
    if (lesson) {
      const progress = lessonProgress(lessonId, await getEntriesForLesson(lessonId), states[lessonId]?.completedAt ?? null);
      if (lessonIsComplete(lesson.steps.length, progress)) {
        const average = lessonScore(lesson.steps.length, progress);
        await completeLesson(lessonId, average, average == null || average >= LESSON_PASS);
        onLessonCompleted();
        return lessonId;
      }
    }
  }
  return undefined;
}
