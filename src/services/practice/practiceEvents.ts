import type { PracticeContext } from "../../domain/practice";
import { completePlanStep } from "../db/progressRepo";
import { logger } from "../../utils/logger";

export interface PracticeStepDone {
  context: PracticeContext;
  score: number | null; // 0-1 when the step was scored
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
export async function completePracticeStep(context: PracticeContext | undefined, score: number | null): Promise<void> {
  if (!context) return;
  try {
    if (context.planDate && context.planStepId) await completePlanStep(context.planDate, context.planStepId);
  } catch (error) {
    logger.error(`[practice] couldn't save plan progress — ${(error as Error).message}`);
  }
  listeners.forEach((l) => l({ context, score }));
}
