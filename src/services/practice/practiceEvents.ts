import type { PracticeContext } from "../../domain/practice";
import { completePlanStep, completeTopUpStep } from "../db/progressRepo";
import { syncDailyReminder } from "../notifications/reminderScheduler";
import { logger } from "../../utils/logger";
import { onLessonCompleted } from "../path/pathService";

export interface PracticeStepDone {
  context: PracticeContext;
  score: number | null; // 0-1 when the step was scored
  // Set when the step was a recording that became a session.
  sessionId?: string;
}

type Listener = (event: PracticeStepDone) => void;
const listeners = new Set<Listener>();

export function subscribePracticeSteps(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Called by a drill / guided / rep screen when its step is finished. Marks
// the plan step done (persisted, so the plan resumes after a restart) and
// tells the lesson or daily-session screen underneath.
export async function completePracticeStep(context: PracticeContext | undefined, score: number | null, sessionId?: string): Promise<void> {
  if (!context) return;
  try {
    if (context.planDate && context.planStepId) {
      if (context.planSlot) await completeTopUpStep(context.planDate, context.planSlot, context.planStepId);
      else await completePlanStep(context.planDate, context.planStepId);
      // A finished session may satisfy a reminder that's still armed.
      syncDailyReminder().catch(() => undefined);
      // ...and may have finished a lesson, and with it a unit on your path.
      if (!context.planSlot) onLessonCompleted();
    }
  } catch (error) {
    logger.error(`[practice] couldn't save plan progress — ${(error as Error).message}`);
  }
  listeners.forEach((l) => l({ context, score, sessionId }));
}
