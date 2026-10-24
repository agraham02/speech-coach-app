import { useEffect, useMemo, useState } from "react";
import { useElapsed } from "./useElapsed";
import { getTakeAnalyses, watchTake } from "../services/analysis/store";
import { summarizeWork, type ReviewRecord, type WorkSummary } from "../domain/analysis/progress";
import type { StepState } from "../domain/sessionSteps";

// A take's work as the one shared summary (domain/analysis/progress.ts), from
// the steps a screen already reads (useSessionSteps) plus the judged review's
// record. `elapsed` counts seconds while work is going on, so a screen can say
// "taking longer than usual" honestly.
export function useTakeWork(sessionId: string, steps: StepState[]): { work: WorkSummary; elapsed: number } {
  const [review, setReview] = useState<ReviewRecord | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    const load = () =>
      getTakeAnalyses(sessionId)
        .then((all) => alive && setReview(all.take_review ?? null))
        .catch(() => undefined);
    load();
    const stop = watchTake(sessionId, (kind) => {
      if (kind === "take_review") load();
    });
    return () => {
      alive = false;
      stop();
    };
    // The record is written just before the step reports its outcome, so a
    // step change is the cue to read it again.
  }, [sessionId, steps]);

  const work = useMemo(() => summarizeWork(steps, review), [steps, review]);

  const busy = work.phase === "running" || work.phase === "queued";
  const elapsed = useElapsed(busy);

  return { work, elapsed };
}
