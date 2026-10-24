import type { LiveTiming } from "./prepareLive";

// When a reply is over: "end of turn" detection for the live conversation.
// Pure. Lenient on purpose: ending someone's turn while they gather a thought
// is the opposite of what this practice is for.
//
// What it reads, kept by the turn machine as the reply goes:
// - recognized words (the speech recognizer's partial results);
// - the last moment there was voice: a recognizer result (minus its usual
//   lag) or a loud enough volume reading, whichever is later.
//
// A reply ends:
// - "pause": words were heard, and then quiet for the end-of-reply silence.
//   Longer when the last word leads somewhere ("and", "because", "um"), and
//   when only a word or two has come out so far.
// - "blank": no words at all by the blank wait, and nothing voiced just now.
// - "cap": the reply reached its cap.
// - "tap": the person tapped Done (the machine handles that one).

export type EndReason = "pause" | "blank" | "cap" | "tap";

export interface ListenProgress {
  startedAt: number;
  // Epoch ms of the last voice: recognized speech or a loud volume reading.
  lastVoiceAt: number | null;
  // Words recognized so far in this reply.
  words: number;
  // The last recognized word, normalized (lowercase letters).
  lastWord: string | null;
}

// Words that mean the sentence isn't finished.
const CONNECTORS = new Set([
  "and",
  "but",
  "so",
  "because",
  "cause",
  "or",
  "then",
  "like",
  "um",
  "uh",
  "er",
  "erm",
  "the",
  "a",
  "an",
  "to",
  "of",
  "with",
  "if",
  "when",
  "that",
  "which",
  "my",
  "i",
  "is",
  "was",
]);

export const CONNECTOR_STRETCH = 1.6;
export const SHORT_START_STRETCH = 1.4;
// Under this many words, a pause is more likely a thought being gathered.
export const SHORT_START_WORDS = 3;

export function silenceNeeded(progress: Pick<ListenProgress, "words" | "lastWord">, timing: Pick<LiveTiming, "endSilenceMs">): number {
  let ms = timing.endSilenceMs;
  if (progress.lastWord && CONNECTORS.has(progress.lastWord)) ms *= CONNECTOR_STRETCH;
  else if (progress.words < SHORT_START_WORDS) ms *= SHORT_START_STRETCH;
  return Math.round(ms);
}

export function endpointDecision(progress: ListenProgress, now: number, timing: LiveTiming): Exclude<EndReason, "tap"> | null {
  const elapsed = now - progress.startedAt;
  if (elapsed >= timing.maxReplyMs) return "cap";
  const sinceVoice = progress.lastVoiceAt == null ? Infinity : now - progress.lastVoiceAt;
  if (progress.words > 0) {
    return sinceVoice >= silenceNeeded(progress, timing) ? "pause" : null;
  }
  // Nothing recognized yet. Someone mid-word (voice, no words yet) gets the
  // end-of-reply silence before it counts as a blank.
  if (elapsed >= timing.blankWaitMs && sinceVoice >= timing.endSilenceMs) return "blank";
  return null;
}

// The last word of a transcript, normalized for the connector check.
export function lastWordOf(text: string): string | null {
  const words = text.toLowerCase().match(/[a-z']+/g);
  if (!words?.length) return null;
  return words[words.length - 1].replace(/'/g, "");
}

export function wordCountOf(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
