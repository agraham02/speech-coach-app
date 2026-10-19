// When to ask "how's Tono going?". Pure: the screen reads the counts and the
// saved state and asks this.

export interface FeedbackPromptState {
  // They picked Great or Could be better: never ask again.
  answeredAt: string | null;
  lastShownAt: string | null;
  // Times it was put away with "Not now".
  dismissed: number;
}

export const EMPTY_FEEDBACK_STATE: FeedbackPromptState = { answeredAt: null, lastShownAt: null, dismissed: 0 };

// Enough use to have an opinion, on more than one day.
export const MIN_REPS = 5;
export const MIN_DAYS = 3;
// After "Not now", leave them alone for a good while, and stop after three.
export const GAP_DAYS = 45;
export const MAX_DISMISSALS = 3;

export function shouldAskForFeedback(usage: { reps: number; days: number }, state: FeedbackPromptState, now: Date): boolean {
  if (state.answeredAt) return false;
  if (state.dismissed >= MAX_DISMISSALS) return false;
  if (usage.reps < MIN_REPS || usage.days < MIN_DAYS) return false;
  if (state.lastShownAt) {
    const since = now.getTime() - new Date(state.lastShownAt).getTime();
    if (Number.isFinite(since) && since < GAP_DAYS * 86_400_000) return false;
  }
  return true;
}

export type FeedbackAnswer = "great" | "better" | "later";

export function afterAnswer(state: FeedbackPromptState, answer: FeedbackAnswer, now: Date): FeedbackPromptState {
  const at = now.toISOString();
  if (answer === "later") return { ...state, lastShownAt: at, dismissed: state.dismissed + 1 };
  return { ...state, lastShownAt: at, answeredAt: at };
}
