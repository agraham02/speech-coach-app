import type { SessionStep, StepStatus } from "../../domain/sessionSteps";

// A step of one session changed status. Screens subscribe for live updates;
// the DB (session_steps) stays the source of truth, so a screen opened after
// a restart reads the persisted state and doesn't depend on these events.
export interface SessionStepEvent {
  sessionId: string;
  step: SessionStep;
  status: StepStatus;
  errorMessage?: string | null;
}

type Listener = (event: SessionStepEvent) => void;

const sessionListeners = new Map<string, Set<Listener>>();
const wildcardListeners = new Set<Listener>();

export function emitStepEvent(event: SessionStepEvent): void {
  sessionListeners.get(event.sessionId)?.forEach((listener) => listener(event));
  wildcardListeners.forEach((listener) => listener(event));
}

// Updates for one session (Result screen).
export function subscribeToSession(sessionId: string, listener: Listener): () => void {
  if (!sessionListeners.has(sessionId)) sessionListeners.set(sessionId, new Set());
  sessionListeners.get(sessionId)!.add(listener);
  return () => {
    sessionListeners.get(sessionId)?.delete(listener);
  };
}

// Updates for any session (History/Trends refresh their lists).
export function subscribeToAllSessions(listener: Listener): () => void {
  wildcardListeners.add(listener);
  return () => {
    wildcardListeners.delete(listener);
  };
}
