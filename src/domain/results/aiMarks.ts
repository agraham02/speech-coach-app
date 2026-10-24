import type { GeminiQuoteAnnotation, LocatedAnnotation } from "../transcriptAnnotations";
import { SUBCATEGORIES } from "../scoring/taxonomy";

// Tono AI's marks on the transcript tab, kept only when they hold up.
//
// A judged take comes back with a few quoted moments ("annotations"). They
// used to be painted straight onto the transcript, which is why they felt
// random: the quotes came from the reviewer's own transcript (a video review
// transcribes the audio itself, so its words differ from the ones on screen),
// they were found by the first matching text anywhere, and half the
// categories (presence, delivery) point at something you can't see in
// words. Now a mark is shown only when
//   - it is about the words (structure, the point, a repeated idea), and
//   - its quote is found in the transcript on screen, whole words, ignoring
//     case and punctuation, in exactly one place.
// Anything else is dropped, never guessed at. The label is the taxonomy's
// name for what it is evidence for. Pure.

export type AiMarkCategory = "structure" | "content" | "restated_point";

// What a mark is evidence for, in the taxonomy's names.
const MARK_LABELS: Record<AiMarkCategory, string> = {
  structure: SUBCATEGORIES.structure.label,
  content: SUBCATEGORIES.relevance.label,
  restated_point: "Repeated idea",
};

export const MAX_AI_MARKS = 6;
const MIN_QUOTE_WORDS = 3;

export interface AiMark extends LocatedAnnotation {
  category: AiMarkCategory;
  label: string;
}

interface Token {
  norm: string;
  start: number;
  end: number;
}

// Words with their place in the text. Tokens with no letter or digit in them
// (a dash, a lone quote mark) are skipped, so they can't break a match.
function tokens(text: string): Token[] {
  const out: Token[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const norm = m[0].toLowerCase().replace(/[^\p{L}\p{N}']/gu, "").replace(/^'+|'+$/g, "");
    if (norm) out.push({ norm, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

// The one place the quote occurs in the transcript, as a character span; null
// when it is absent, too short to be specific, or occurs more than once.
export function locateUniqueQuote(transcript: string, quote: string): { start: number; end: number } | null {
  const words = tokens(quote).map((t) => t.norm);
  if (words.length < MIN_QUOTE_WORDS) return null;
  const hay = tokens(transcript);
  let found: { start: number; end: number } | null = null;
  for (let i = 0; i + words.length <= hay.length; i++) {
    let ok = true;
    for (let j = 0; j < words.length; j++) {
      if (hay[i + j].norm !== words[j]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (found) return null;
    const last = hay[i + words.length - 1];
    // The highlight stops at the last letter, not at the full stop after it.
    const trail = transcript.slice(last.start, last.end).match(/[^\p{L}\p{N}']+$/u);
    found = { start: hay[i].start, end: last.end - (trail ? trail[0].length : 0) };
  }
  return found;
}

const isMarkCategory = (c: string): c is AiMarkCategory => c === "structure" || c === "content" || c === "restated_point";

// The reviewer's annotations that can be shown: about the words, found once in
// this transcript, not overlapping, at most MAX_AI_MARKS, in reading order.
export function groundAiMarks(transcript: string, annotations: GeminiQuoteAnnotation[]): AiMark[] {
  const marks: AiMark[] = [];
  for (const a of annotations) {
    if (!isMarkCategory(a.category) || !a.note?.trim()) continue;
    const span = locateUniqueQuote(transcript, a.quote);
    if (!span) continue;
    if (marks.some((m) => span.start < m.end && m.start < span.end)) continue;
    marks.push({ ...span, category: a.category, label: MARK_LABELS[a.category], note: a.note.trim() });
    if (marks.length >= MAX_AI_MARKS) break;
  }
  return marks.sort((x, y) => x.start - y.start);
}
