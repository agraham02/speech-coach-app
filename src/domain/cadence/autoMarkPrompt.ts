import { parseNotation } from "./notation";
import { sanitizeMarks, wordsOf, type MarkedText } from "./marks";

// AI marking (Tono AI). Asking a model for word indices is fragile, so it
// returns the text rewritten in the notation instead (the prompt is on the
// server: supabase/functions/_shared/prompts/exercises.ts); we parse it and
// accept it only if the words come back exactly as given. Anything else falls back
// to the rule marker. Pure.

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
