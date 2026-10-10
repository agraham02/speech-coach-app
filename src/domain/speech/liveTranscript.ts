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
// Tongue twisters repeat the exact same words on purpose, so repeated text
// is never stripped by content alone — that would silently delete a genuine
// second repetition. The one exception is an *echo*: iOS 18+ sometimes
// re-reports audio it already finalized (a late partial repeating the last
// segment, or a closing final holding every segment of the task). An echo
// is recognized by shape, not just content: it's the very first result after
// a commit, it already starts with whole committed utterance(s) of 4+ words,
// and it shows up all at once. Genuine speech builds up from its first word
// ("she", "she sells", ...), so it never looks like that.
import { normalizeWord } from "./normalize";

// Recognition reports a word roughly this long after it's spoken, so a
// result timestamp is shifted back by it to estimate when speech happened.
export const FIRST_RESULT_LATENCY_MS = 400;

// Shorter committed text is too easy to say again within one partial.
const MIN_ECHO_WORDS = 4;

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
  // Normalized words of already-committed text that the current utterance
  // is echoing; stripped from each result until the results stop starting
  // with them.
  echoPrefix: string[] | null;
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
  echoPrefix: null,
  firstResultAtMs: null,
  lastResultAtMs: null,
};

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

// The text left after removing `prefix` (normalized words) from its start,
// or null when the text doesn't start with it.
function stripPrefix(text: string, prefix: string[]): string | null {
  const raw = words(text);
  if (raw.length < prefix.length) return null;
  for (let i = 0; i < prefix.length; i++) {
    if (normalizeWord(raw[i]) !== prefix[i]) return null;
  }
  return raw.slice(prefix.length).join(" ");
}

// Committed text of the current task this result could be echoing: all of
// it (a cumulative closing final), or just the latest utterance (a late
// partial). Longest first.
function findEcho(state: LiveTranscript, text: string): string[] | null {
  const inTask = state.committed.filter((u) => u.taskId === state.taskId);
  if (!inTask.length) return null;
  const candidates = [inTask.map((u) => u.text).join(" "), inTask[inTask.length - 1].text];
  for (const candidate of candidates) {
    const prefix = words(candidate).map(normalizeWord).filter(Boolean);
    if (prefix.length >= MIN_ECHO_WORDS && stripPrefix(text, prefix) !== null) return prefix;
  }
  return null;
}

export function reduceResult(state: LiveTranscript, result: RecognitionResult, nowMs: number): LiveTranscript {
  let text = result.transcript.trim();
  let echoPrefix = state.echoPrefix;
  if (text) {
    if (!echoPrefix && !state.sawPartialSinceCommit) echoPrefix = findEcho(state, text);
    if (echoPrefix) {
      const rest = stripPrefix(text, echoPrefix);
      // Stopped starting with the echo: this is new speech.
      if (rest === null) echoPrefix = null;
      else text = rest;
    }
  }
  const timing = text
    ? { firstResultAtMs: state.firstResultAtMs ?? nowMs, lastResultAtMs: nowMs }
    : { firstResultAtMs: state.firstResultAtMs, lastResultAtMs: state.lastResultAtMs };

  if (!result.isFinal) {
    return { ...state, ...timing, partial: text, echoPrefix, sawPartialSinceCommit: state.sawPartialSinceCommit || !!text };
  }
  if (!text) return { ...state, ...timing, partial: "", echoPrefix: null };

  // Some recognizers emit the same final twice (e.g. a pause-triggered final
  // followed by the task's closing final). A repeat with no partial in
  // between is that duplicate; a repeat *with* partials is a real rep.
  const last = state.committed[state.committed.length - 1];
  if (last && last.text === text && !state.sawPartialSinceCommit) {
    return { ...state, ...timing, partial: "", echoPrefix: null };
  }
  return {
    ...state,
    ...timing,
    committed: [...state.committed, { text, taskId: state.taskId, atMs: nowMs }],
    partial: "",
    sawPartialSinceCommit: false,
    echoPrefix: null,
  };
}

// Called on every recognizer (re)start. Any dangling partial is promoted
// first so words spoken right before the restart aren't lost.
export function beginTask(state: LiveTranscript, nowMs: number): LiveTranscript {
  const promoted = finalizePartial(state, nowMs);
  return { ...promoted, taskId: promoted.taskId + 1, echoPrefix: null };
}

// The partial has already had any echo stripped, so it's committed as is.
export function finalizePartial(state: LiveTranscript, nowMs: number): LiveTranscript {
  if (!state.partial.trim()) return { ...state, partial: "", echoPrefix: null };
  return reduceResult(
    { ...state, sawPartialSinceCommit: true, echoPrefix: null },
    { isFinal: true, transcript: state.partial },
    nowMs,
  );
}

export function fullText(state: LiveTranscript): string {
  return [...state.committed.map((u) => u.text), state.partial].filter(Boolean).join(" ");
}
