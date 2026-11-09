// No score without proof the task was done (docs/overhaul/PLAN.md, section 6.4,
// rule 2, and section 7's gate column). A failed gate keeps your minutes and your
// check-off, moves no score, and says why, kindly. "not_checked" is rule 8: nothing
// could check this one, which isn't a failure on your part. Pure.

import type { TopicVerdict } from "./meaning/meaning";

export type GateVerdict = { passed: true } | { passed: false; kind: "failed" | "not_checked"; reason: string };

export const PASSED: GateVerdict = { passed: true };

const failed = (reason: string): GateVerdict => ({ passed: false, kind: "failed", reason });
const notChecked = (reason: string): GateVerdict => ({ passed: false, kind: "not_checked", reason });

// People whose first language isn't English: live recognition is less sure of
// their words, which isn't their mistake.
const RELAXED_BY = 10;
const bar = (at: number, relaxed?: boolean) => (relaxed ? at - RELAXED_BY : at);

// Reading drills that must be the words on the screen.
export const READING_ACCURACY = 70;
// Drills whose number is already accuracy: under this it wasn't the target at all.
export const SOME_ACCURACY = 40;

export function readingGate(accuracyPercent: number, relaxed?: boolean): GateVerdict {
  return accuracyPercent >= bar(READING_ACCURACY, relaxed) ? PASSED : failed(`We heard ${Math.round(accuracyPercent)}% of the words, so this one isn't scored. It needs ${bar(READING_ACCURACY, relaxed)}%: read the words on the screen.`);
}

export function accuracyGate(accuracyPercent: number, relaxed?: boolean): GateVerdict {
  return accuracyPercent >= bar(SOME_ACCURACY, relaxed) ? PASSED : failed("We couldn't match that to the words on the screen, so this one isn't scored.");
}

// Word chain and Bridge chain: only a check can tell a link from a random word.
export function chainGate(checked: boolean): GateVerdict {
  return checked ? PASSED : notChecked("Nothing could check these links this time, so this one isn't scored. It still counts as practice.");
}

export function storyGate(wordsUsed: number): GateVerdict {
  return wordsUsed > 0 ? PASSED : failed("None of the words made it into your story, so this one isn't scored.");
}

// Sixty seconds. Babble can't pass: the same few words over and over.
const MIN_WORDS_FOR_REPETITION = 12;
const MIN_DISTINCT_SHARE = 0.35;

export function repetitionGate(words: string[]): GateVerdict {
  if (words.length < MIN_WORDS_FOR_REPETITION) return failed("That was too short to score. Keep talking for the whole time.");
  const distinct = new Set(words.map((w) => w.toLowerCase())).size;
  return distinct / words.length >= MIN_DISTINCT_SHARE ? PASSED : failed("That was mostly the same few words, so this one isn't scored.");
}

// Projection: a shout with no words isn't speech at volume.
export function wordsHeardGate(words: number): GateVerdict {
  return words > 0 ? PASSED : failed("We heard your volume but no words, so this one isn't scored. Say the line, at volume.");
}

// Conversation drills: a reply of 3 or more words, in at least one turn.
export function replyGate(anyReplied: boolean): GateVerdict {
  return anyReplied ? PASSED : failed("We didn't hear a reply of 3 words or more, so this one isn't scored.");
}

// Rolling summary: the paragraph's key words, or a judge who read what you said.
export function keyWordsGate(hits: number, judged: boolean): GateVerdict {
  return judged || hits > 0 ? PASSED : failed("None of the key words came through, so this one isn't scored.");
}

// Explain it simply: short nonsense can't pass. A key term, or a judge's say.
export function explainGate(keyTermSaid: boolean, judgedInaccurate: boolean, judged: boolean): GateVerdict {
  if (judged) return judgedInaccurate ? failed("That wasn't quite what the idea means, so this one isn't scored.") : PASSED;
  return keyTermSaid ? PASSED : failed("We didn't hear the idea's key term, so this one isn't scored.");
}

// A take. Enough words to score, a script that was really read, and a judge who
// didn't say it can't be scored. On-topic and coherence checks join this with the
// phone's meaning check (3b.4).
export const TAKE_MIN_WORDS = 20;
export const SCRIPT_READ_BAR = 80;

// The phone's meaning check on what was said (3b.4). Null or "ok": nothing to say,
// which includes every phone that can't check. Takes use both verdicts; drills only
// the second, since a topic of a few words is not what the check was tuned on.
export function topicGate(verdict: TopicVerdict | null | undefined, about: "prompt" | "sentences" = "prompt"): GateVerdict {
  if (verdict === "incoherent") return failed("The sentences didn't seem to connect to each other, so this one isn't scored.");
  if (verdict === "off_topic" && about === "prompt") return failed("That didn't seem to be about the prompt, so this one isn't scored.");
  return PASSED;
}

export function takeGate(input: { kind: "impromptu" | "script"; wordCount: number; readAccuracyPercent: number | null; relaxed?: boolean; judgeSays?: string | null; topic?: TopicVerdict | null }): GateVerdict {
  if (input.judgeSays) return failed(`We couldn't score this one. ${input.judgeSays} You keep your minutes.`);
  if (input.wordCount < TAKE_MIN_WORDS) return failed("We couldn't score this one: there weren't enough words to go on. You keep your minutes.");
  if (input.kind === "script" && input.readAccuracyPercent != null && input.readAccuracyPercent < bar(SCRIPT_READ_BAR, input.relaxed)) {
    return failed(`We couldn't score this one: we heard ${Math.round(input.readAccuracyPercent)}% of the script, and it needs ${bar(SCRIPT_READ_BAR, input.relaxed)}%. You keep your minutes.`);
  }
  if (input.kind === "impromptu") {
    const topic = topicGate(input.topic);
    if (!topic.passed) return { ...topic, reason: `We couldn't score this one. ${topic.reason.replace(", so this one isn't scored.", ".")} You keep your minutes.` };
  }
  return PASSED;
}
