import { words } from "./text";

// "Did that reply ask something?" — from words alone, because live
// recognition has punctuation turned off. A soft cue, never a verdict: the
// screens show it as an observation the user can shrug off.

const WH = new Set(["what", "how", "why", "where", "when", "who", "which", "whats", "hows", "wheres", "whos"]);
// What tends to follow a question word in a real question ("how did",
// "what was", "why do"), as opposed to "what I mean is…" or "when I was…".
const WH_FOLLOWERS = new Set([
  "is", "was", "are", "were", "do", "did", "does", "made", "makes", "got", "kind", "sort", "about", "happened", "happens",
  "would", "could", "should", "will", "can", "has", "have", "had", "s", "else", "exactly", "part", "long", "much", "many",
  "often", "come", "comes", "came", "brought", "led", "got", "drew", "the", "a", "your", "you", "that", "it", "they", "she", "he",
]);
const AUX = new Set(["do", "did", "does", "have", "has", "had", "are", "were", "was", "is", "can", "could", "would", "will", "should"]);
const SUBJECTS = new Set(["you", "it", "they", "she", "he", "that", "this", "there", "we"]);
// "did you…" only reads as a question at the start of a thought. With no
// punctuation, "the start" means the first word or right after one of these.
const LEADS = new Set([
  "so", "and", "but", "wait", "oh", "okay", "ok", "well", "like", "then", "really", "hey", "also", "actually", "now", "right",
  "yeah", "nice", "cool", "wow", "seriously", "huh",
]);

// Number of question-like spots in the text.
export function countQuestions(text: string): number {
  const marks = (text.match(/\?/g) ?? []).length;
  const w = words(text);
  let found = 0;
  for (let i = 0; i < w.length; i++) {
    const next = w[i + 1];
    if (WH.has(w[i]) && (next == null || WH_FOLLOWERS.has(next))) {
      // "what" as the last word of a reply ("…you know what") isn't a question.
      if (next == null && w.length > 2) continue;
      found += 1;
      i += 1;
      continue;
    }
    // "did you…", "have you…", "was it…", "is that…"
    if (AUX.has(w[i]) && next != null && SUBJECTS.has(next)) {
      // Mid-sentence ("I did it", "what I mean is it was fine") isn't a question.
      const prev = w[i - 1];
      if (prev != null && !LEADS.has(prev)) continue;
      found += 1;
      i += 1;
      continue;
    }
    if (w[i] === "tell" && next === "me") {
      found += 1;
      i += 1;
    }
  }
  return Math.max(marks, found);
}

export function isQuestionLike(text: string): boolean {
  return countQuestions(text) > 0;
}
