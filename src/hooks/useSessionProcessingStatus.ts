import { useEffect, useState } from "react";
import { getLastProcessingStatus, subscribeToSession, type ProcessingPhase } from "../services/pipeline/processingEvents";
import { getSessionById } from "../services/db/sessionsRepo";

export interface SessionProcessingState {
  phase: ProcessingPhase;
  errorMessage: string | null;
  notionFailedOnly: boolean;
}

function initialStateFor(sessionId: string): SessionProcessingState {
  const cached = getLastProcessingStatus(sessionId);
  if (cached) {
    return {
      phase: cached.phase,
      errorMessage: cached.errorMessage ?? null,
      notionFailedOnly: cached.notionFailedOnly ?? false,
    };
  }
  return { phase: "saving_locally", errorMessage: null, notionFailedOnly: false };
}

// Reflects a session's live processing status. Seeded from the last known
// in-memory status (so opening this mid-pipeline, e.g. from History, shows
// the real current step instead of resetting to the very first one), falling
// back to the DB's done/error status if the app was restarted and no
// in-memory status exists. Kept in sync via processingEvents while mounted.
export function useSessionProcessingStatus(sessionId: string): SessionProcessingState {
  const [state, setState] = useState<SessionProcessingState>(() => initialStateFor(sessionId));

  useEffect(() => {
    setState(initialStateFor(sessionId));

    let cancelled = false;
    getSessionById(sessionId).then((session) => {
      if (cancelled || !session || getLastProcessingStatus(sessionId)) return;
      if (session.status === "done" || session.status === "error") {
        setState((prev) => ({ ...prev, phase: session.status as "done" | "error" }));
      }
    });

    const unsubscribe = subscribeToSession(sessionId, (status) => {
      setState({
        phase: status.phase,
        errorMessage: status.errorMessage ?? null,
        notionFailedOnly: status.notionFailedOnly ?? false,
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [sessionId]);

  return state;
}
