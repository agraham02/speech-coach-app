import type { SkillId } from "../../theme/tokens";
import type { Stage } from "../../domain/levels";

// A take's progress has settled (services/sessions/repProgress.ts): its
// skill moves are saved and its progress moment can play. The Result screen
// for that take listens and reloads; Today listens to show the "new
// progress" card. Screens that are showing a take register as watching it,
// so the pipeline knows whether anyone saw the moment land.

type Listener = (sessionId: string) => void;

const listeners = new Set<Listener>();
const watching = new Map<string, number>();

export function emitProgressSettled(sessionId: string): void {
  listeners.forEach((listener) => listener(sessionId));
}

export function subscribeToProgress(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Returns the cleanup that stops watching.
export function watchSessionProgress(sessionId: string): () => void {
  watching.set(sessionId, (watching.get(sessionId) ?? 0) + 1);
  return () => {
    const n = (watching.get(sessionId) ?? 1) - 1;
    if (n <= 0) watching.delete(sessionId);
    else watching.set(sessionId, n);
  };
}

export function isWatchingProgress(sessionId: string): boolean {
  return (watching.get(sessionId) ?? 0) > 0;
}

// A drill attempt earned a stage. Drills have no settle step or Result
// screen, so the celebration fires as soon as the attempt is saved.
export interface StageEarned {
  skill: SkillId;
  stage: Stage;
  speakerLevel: number | null;
}

const stageListeners = new Set<(e: StageEarned) => void>();

export function emitStageEarned(e: StageEarned): void {
  stageListeners.forEach((listener) => listener(e));
}

export function subscribeToStageEarned(listener: (e: StageEarned) => void): () => void {
  stageListeners.add(listener);
  return () => {
    stageListeners.delete(listener);
  };
}

// A unit on your path is finished (services/path/pathService.ts).
export interface UnitCompleted {
  unitId: string;
  skill: SkillId;
  unitTitle: string;
  lessons: string[];
  ratingFrom: number | null;
  ratingTo: number | null;
  next: string | null;
}

const unitListeners = new Set<(e: UnitCompleted) => void>();

export function emitUnitCompleted(e: UnitCompleted): void {
  unitListeners.forEach((listener) => listener(e));
}

export function subscribeToUnitCompleted(listener: (e: UnitCompleted) => void): () => void {
  unitListeners.add(listener);
  return () => {
    unitListeners.delete(listener);
  };
}
