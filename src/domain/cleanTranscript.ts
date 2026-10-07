// Rule-based, on-device "clean" transcript for the journal and the Result
// screen. Replaces the Gemini text-only call that recordings without deep
// review used to require — that made every session fail outright when no
// Gemini key was set, even though the on-device transcript was fine.
//
// Deliberately conservative: it removes only pure hesitations (um/uh/erm)
// and stuttered word repeats ("the the"). Discourse words like "like",
// "actually" or "kind of" stay — they often carry meaning, and rewriting
// what you said is the deep review's job, not this function's.

const HESITATION = /\b(?:u+h+m*|u+m+|e+r+m+|h+m+|a+h+)\b[,.]?\s*/gi;

export function cleanTranscript(verbatim: string): string {
  let text = verbatim.replace(HESITATION, " ");

  // Collapse immediate word repeats, case-insensitively, keeping the first.
  text = text.replace(/\b([a-z']+)(?:[\s,]+\1\b)+/gi, "$1");

  text = text
    .replace(/\s+([,.!?;:])/g, "$1") // no space before punctuation
    .replace(/([,;:])(?=\S)/g, "$1 ")
    .replace(/,\s*([.!?])/g, "$1") // ", ." left behind by a removed filler
    .replace(/^[\s,;:]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!text) return "";

  // Capitalize sentence starts and standalone "i".
  text = text.replace(/(^|[.!?]\s+)([a-z])/g, (_, lead: string, ch: string) => lead + ch.toUpperCase());
  text = text.replace(/\bi\b/g, "I");

  if (!/[.!?]$/.test(text)) text += ".";
  return text;
}
