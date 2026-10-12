import { z } from "zod";
import { parseNotation } from "./notation";
import { sanitizeMarks, wordsOf, type MarkedText } from "./marks";

// On-device model marking (Apple Foundation Models). Asking a small model
// for word indices is fragile, so it returns the text rewritten in the
// notation instead; we parse it and accept it only if the words come back
// exactly as given. Anything else falls back to the rule marker. Pure.

export const AUTO_MARK_SYSTEM = `You mark short texts for reading aloud, like a voice coach annotating a script.
Rewrite the text EXACTLY as given — same words, same order, same punctuation — adding only these marks:
*word* = stress this word (at most one per phrase, on the word that carries the new information or the contrast)
word↗ = pitch rises at the end of this word (yes/no questions, a thought that continues, list items before the last)
word↘ = pitch falls at the end of this word (statements, wh-questions, the last item of a list)
| = a short pause between words (at commas, dashes, and before a key word)
|| = a long pause (at the end of each sentence, except the very last word)
Every sentence end gets ↗ or ↘. Every comma gets a pause. Do not add or change any words.`;

export function buildAutoMarkPrompt(text: string): string {
  return `Mark this text:\n\n${text}`;
}

export const autoMarkSchema = z.object({
  marked: z.string().describe("The same text with the marks added"),
});

const normalize = (w: string) => w.replace(/[’]/g, "'");

// The model's notation, accepted only if its words match the original.
export function acceptModelMarks(original: string, notation: string): MarkedText | null {
  const expected = wordsOf(original).map(normalize);
  let parsed: MarkedText;
  try {
    parsed = parseNotation(notation);
  } catch {
    return null;
  }
  const got = wordsOf(parsed.text).map(normalize);
  if (got.length !== expected.length || got.some((w, i) => w !== expected[i])) return null;
  const marks = sanitizeMarks(parsed.marks, expected.length);
  if (!marks.length) return null;
  return { text: wordsOf(original).join(" "), marks };
}
