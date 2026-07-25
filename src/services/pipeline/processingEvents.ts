export type ProcessingPhase =
  | "saving_locally"
  | "uploading"
  | "processing"
  | "transcribing"
  | "saving_notion"
  | "done"
  | "error";

export interface ProcessingStatus {
  sessionId: string;
  phase: ProcessingPhase;
  errorMessage?: string;
}

type Listener = (status: ProcessingStatus) => void;

const sessionListeners = new Map<string, Set<Listener>>();
const wildcardListeners = new Set<Listener>();

// Caches the most recent status per session, since a screen that subscribes
// mid-pipeline (e.g. opened from History after processing already started)
// would otherwise only see whatever event fires *next* — appearing stuck on
// whatever the initial default was until then.
const lastStatusBySession = new Map<string, ProcessingStatus>();

export function emitProcessingStatus(status: ProcessingStatus): void {
  lastStatusBySession.set(status.sessionId, status);
  sessionListeners.get(status.sessionId)?.forEach((listener) => listener(status));
  wildcardListeners.forEach((listener) => listener(status));
}

export function getLastProcessingStatus(sessionId: string): ProcessingStatus | undefined {
  return lastStatusBySession.get(sessionId);
}

// Subscribe to updates for one specific session (used by the Processing/Result viewer).
export function subscribeToSession(sessionId: string, listener: Listener): () => void {
  if (!sessionListeners.has(sessionId)) sessionListeners.set(sessionId, new Set());
  sessionListeners.get(sessionId)!.add(listener);
  return () => sessionListeners.get(sessionId)?.delete(listener);
}

// Subscribe to updates for ANY session (used by History to refresh its list live).
export function subscribeToAllSessions(listener: Listener): () => void {
  wildcardListeners.add(listener);
  return () => wildcardListeners.delete(listener);
}
