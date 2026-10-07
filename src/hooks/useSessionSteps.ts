import { useCallback, useEffect, useState } from "react";
import { getSessionSteps } from "../services/db/stepsRepo";
import { subscribeToSession } from "../services/pipeline/processingEvents";
import type { StepState } from "../domain/sessionSteps";

// A session's analysis steps, read from the database (so it's correct after
// an app restart) and refreshed live as steps change. `onStepFinished` lets
// the screen reload whatever data a finished step produced.
export function useSessionSteps(sessionId: string, onStepFinished?: () => void) {
  const [steps, setSteps] = useState<StepState[]>([]);

  const reload = useCallback(() => {
    getSessionSteps(sessionId).then(setSteps);
  }, [sessionId]);

  useEffect(() => {
    reload();
    return subscribeToSession(sessionId, (event) => {
      reload();
      if (event.status === "done" || event.status === "failed") onStepFinished?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, reload]);

  return { steps, reload };
}
