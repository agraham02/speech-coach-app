import { sentences, words } from "../conversation/text";
import { isQuestionLike } from "../conversation/questions";

// "Did it get to the point, and did it stop?" — soft, on-device cues for
// rambling. The fix the coaching teaches is the same everywhere: point
// first, one reason or example, then a clean stop. Every number here is a
// heuristic over words, so the screens phrase results as observations.

// Both patterns run on normalized words (see `plain`): lowercase, no
// punctuation, apostrophes dropped ("that's" -> "thats"), fillers removed.

// Throat-clearing openers that delay the point ("so basically…",
// "that's a good question…"). The first sentence that isn't one of these
// is taken as where the answer starts.
const PREAMBLE =
  /^(so|well|okay|ok|basically|honestly|i mean|like|i guess|yeah|right|thats a (good|great|tough|hard) question|good question|let me (think|see)|it depends|where (do|should) i (start|begin)|i dont know)\b/;

// Endings that trail off instead of landing.
const TRAILING = /\b(so yeah|yeah so|i dont know|i dunno|or whatever|or something|and stuff|and everything|anyway|i guess|you know|thats it|thats about it|kind of thing)$/;

// Detour markers: each one usually means a side trip.
const TANGENTS = [
  "by the way",
  "speaking of",
  "oh and",
  "that reminds me",
  "side note",
  "random but",
  "not to go off",
  "off topic",
  "where was i",
  "what was i saying",
  "anyway",
  "long story short",
];

// Self-corrections that restart the thought.
const RESTARTS = ["let me start over", "let me rephrase", "what i mean is", "i mean", "actually no", "wait no", "scratch that"];

export interface RamblingMetrics {
  wordCount: number;
  // Sentences (or pause-separated chunks) before the first real one.
  sentencesBeforePoint: number;
  // The answer's first real sentence is a short statement, not a question.
  pointFirst: boolean;
  trailingOff: boolean;
  tangentMarkers: number;
  restarts: number;
  // durationSeconds / budgetSeconds, when a budget was set.
  lengthVsBudget: number | null;
}

function countPhrases(text: string, phrases: string[]): number {
  const padded = ` ${words(text).join(" ")} `;
  let n = 0;
  for (const p of phrases) {
    const needle = ` ${p.replace(/'/g, "")} `;
    let from = 0;
    for (;;) {
      const at = padded.indexOf(needle, from);
      if (at === -1) break;
      n += 1;
      from = at + needle.length - 1;
    }
  }
  return n;
}

function plain(sentence: string): string {
  return words(sentence).join(" ");
}

// A chunk is throat-clearing if stripping its leading preamble phrases
// ("so", "let me think", "well") leaves almost nothing. "I guess the
// mountains, because…" is a hedged point, not a preamble.
function isPreamble(sentence: string): boolean {
  let rest = plain(sentence);
  for (let i = 0; i < 6; i++) {
    const m = PREAMBLE.exec(rest);
    if (!m) break;
    rest = rest.slice(m[0].length).trim();
  }
  return rest.split(" ").filter(Boolean).length < 3 && rest !== plain(sentence);
}

export function ramblingMetrics(input: {
  transcript: string;
  // Pause-separated recognizer utterances, used as sentences when the
  // transcript has no punctuation.
  segments?: string[];
  durationSeconds?: number;
  budgetSeconds?: number | null;
}): RamblingMetrics {
  const text = input.transcript.trim();
  const all = words(text);
  let chunks = sentences(text, input.segments);
  // One long unpunctuated run: treat the first ~25 words as the opener.
  if (chunks.length <= 1 && all.length > 30) chunks = [all.slice(0, 25).join(" "), all.slice(25).join(" ")];

  let before = 0;
  while (before < chunks.length - 1 && isPreamble(chunks[before])) before += 1;
  const opener = chunks[before] ?? "";
  // A preamble glued to the point ("so basically I'd pick…") still counts
  // as the point: only whole throat-clearing chunks delay it.
  const openerWords = words(opener).length;
  const pointFirst = before === 0 && openerWords >= 3 && openerWords <= 30 && !isQuestionLike(opener);

  const last = chunks[chunks.length - 1] ?? "";
  return {
    wordCount: all.length,
    sentencesBeforePoint: before,
    pointFirst,
    trailingOff: last ? TRAILING.test(plain(last)) : false,
    tangentMarkers: countPhrases(text, TANGENTS),
    restarts: countPhrases(text, RESTARTS),
    lengthVsBudget:
      input.budgetSeconds && input.durationSeconds != null ? Math.round((input.durationSeconds / input.budgetSeconds) * 100) / 100 : null,
  };
}
