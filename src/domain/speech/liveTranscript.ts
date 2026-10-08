// Pure reducer for live speech-recognition results.
//
// In continuous mode each final result covers only the newest utterance
// (Android's segmented sessions, and iOS 18+, which resets its transcription
// after every pause); the next partial starts from empty. Older iOS
// recognizers are cumulative but only send a final at the very end of a
// recognition task, so appending finals is correct for every platform.
// The old hook *replaced* its transcript on each event, so everything
// before the latest pause vanished.
//
// Deliberately no "strip the repeated prefix" logic: tongue twisters repeat
// the exact same words on purpose, and any prefix heuristic would silently
// delete a genuine second repetition.

// Recognition reports a word roughly this long after it's spoken, so a
// result timestamp is shifted back by it to estimate when speech happened.
export const FIRST_RESULT_LATENCY_MS = 400;

export interface Utterance {
  text: string;
  taskId: number;
  atMs: number;
}

export interface LiveTranscript {
  committed: Utterance[];
  partial: string;
  // Incremented on every recognizer (re)start.
  taskId: number;
  // Whether any partial arrived since the last committed final — used to
  // tell a duplicated final event apart from a genuine repetition.
  sawPartialSinceCommit: boolean;
  firstResultAtMs: number | null;
  lastResultAtMs: number | null;
}

export interface RecognitionResult {
  isFinal: boolean;
  transcript: string;
}

export const EMPTY_TRANSCRIPT: LiveTranscript = {
  committed: [],
  partial: "",
  taskId: 0,
  sawPartialSinceCommit: false,
  firstResultAtMs: null,
  lastResultAtMs: null,
};

export function reduceResult(state: LiveTranscript, result: RecognitionResult, nowMs: number): LiveTranscript {
  const text = result.transcript.trim();
  const timing = text
    ? { firstResultAtMs: state.firstResultAtMs ?? nowMs, lastResultAtMs: nowMs }
    : { firstResultAtMs: state.firstResultAtMs, lastResultAtMs: state.lastResultAtMs };

  if (!result.isFinal) {
    return { ...state, ...timing, partial: text, sawPartialSinceCommit: state.sawPartialSinceCommit || !!text };
  }
  if (!text) return { ...state, ...timing, partial: "" };

  // Some recognizers emit the same final twice (e.g. a pause-triggered final
  // followed by the task's closing final). A repeat with no partial in
  // between is that duplicate; a repeat *with* partials is a real rep.
  const last = state.committed[state.committed.length - 1];
  if (last && last.text === text && !state.sawPartialSinceCommit) {
    return { ...state, ...timing, partial: "" };
  }
  return {
    ...state,
    ...timing,
    committed: [...state.committed, { text, taskId: state.taskId, atMs: nowMs }],
    partial: "",
    sawPartialSinceCommit: false,
  };
}

// Called on every recognizer (re)start. Any dangling partial is promoted
// first so words spoken right before the restart aren't lost.
export function beginTask(state: LiveTranscript, nowMs: number): LiveTranscript {
  const promoted = finalizePartial(state, nowMs);
  return { ...promoted, taskId: promoted.taskId + 1 };
}

export function finalizePartial(state: LiveTranscript, nowMs: number): LiveTranscript {
  if (!state.partial.trim()) return { ...state, partial: "" };
  return reduceResult({ ...state, sawPartialSinceCommit: true }, { isFinal: true, transcript: state.partial }, nowMs);
}

export function fullText(state: LiveTranscript): string {
  return [...state.committed.map((u) => u.text), state.partial].filter(Boolean).join(" ");
}
