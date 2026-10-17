import type { TimedWord } from "./verbatim";

// Signs that a transcription engine did not actually hear the speech: it
// described noise, looped on one phrase, ran past the end of the recording,
// or came back with far too few words. Whisper models do all of these on bad
// input or long silence, and the result still looks like "a transcript" to
// everything downstream. Pure.

export type TranscriptProblemKind = "runs_past_audio" | "sound_tags" | "looping" | "too_few_words";

export interface TranscriptProblem {
  kind: TranscriptProblemKind;
  detail: string;
}

export interface TranscriptCheckInput {
  text: string;
  words?: TimedWord[] | null;
  audioSeconds: number;
}

// Word timings may end a little after the audio (padding, rounding).
const OVERRUN_MS = 1500;
// Normal speech runs 100-180 words a minute. Below this across a whole take,
// the engine missed most of what was said.
const MIN_WORDS_PER_MINUTE = 25;
const MIN_SECONDS_FOR_RATE = 15;
// The same phrase this many times is a decoder loop, not emphasis.
const LOOP_REPEATS = 3;

// "(dryer", "*Sounds of water*", "[BREAKING SOUND]": descriptions of noise.
// Bracketed fillers ([UM]) are rewritten to plain words before this runs.
const SOUND_TAG = /[[(*][^[\]()*]{1,60}[\])*]?/g;

const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean);

function normalizePhrase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findLoop(text: string): string | null {
  const counts = new Map<string, number>();
  for (const piece of text.split(/[.!?]+/)) {
    const phrase = normalizePhrase(piece);
    if (wordsOf(phrase).length < 2) continue;
    const n = (counts.get(phrase) ?? 0) + 1;
    counts.set(phrase, n);
    if (n >= LOOP_REPEATS) return phrase;
  }
  return null;
}

export function findTranscriptProblems({ text, words, audioSeconds }: TranscriptCheckInput): TranscriptProblem[] {
  const problems: TranscriptProblem[] = [];
  const count = wordsOf(text).length;

  const last = words && words.length ? words[words.length - 1] : null;
  if (last && audioSeconds > 0 && last.endMs > audioSeconds * 1000 + OVERRUN_MS) {
    problems.push({
      kind: "runs_past_audio",
      detail: `words run to ${(last.endMs / 1000).toFixed(1)} s of ${audioSeconds.toFixed(1)} s of audio`,
    });
  }

  const tags = text.match(SOUND_TAG) ?? [];
  const tagWords = tags.reduce((n, tag) => n + wordsOf(tag).length, 0);
  if (tags.length >= 2 || (count > 0 && tagWords / count >= 0.2)) {
    problems.push({ kind: "sound_tags", detail: `describes sounds, like "${(tags[0] ?? "").trim().slice(0, 30)}"` });
  }

  const loop = findLoop(text);
  if (loop) problems.push({ kind: "looping", detail: `repeats "${loop.slice(0, 30)}"` });

  if (audioSeconds >= MIN_SECONDS_FOR_RATE && count / (audioSeconds / 60) < MIN_WORDS_PER_MINUTE) {
    problems.push({ kind: "too_few_words", detail: `${count} words in ${Math.round(audioSeconds)} s` });
  }
  return problems;
}

export function describeTranscriptProblems(problems: TranscriptProblem[]): string | null {
  if (!problems.length) return null;
  return "Looks wrong: " + problems.map((p) => p.detail).join("; ") + ".";
}
