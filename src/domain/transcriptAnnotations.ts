export type AnnotationCategory = "filler" | "structure" | "delivery" | "presence" | "content";

export interface LocatedSpan {
  start: number;
  end: number; // exclusive
}

export interface FillerMatch extends LocatedSpan {
  word: string;
}

// Curated on purpose: these are near-universally filler in spontaneous speech
// (as opposed to e.g. "so"/"well", which are too often legitimate sentence
// starters and would generate too many false positives to be useful).
const FILLER_WORD_PATTERNS = [
  "um+",
  "uhm+",
  "uh+",
  "erm?",
  "you know",
  "i mean",
  "like",
  "sort of",
  "kind of",
  "basically",
  "actually",
  "literally",
] as const;

const FILLER_REGEX = new RegExp(`\\b(${FILLER_WORD_PATTERNS.join("|")})\\b`, "gi");

// Deterministic, on-device — never depends on whether Gemini happened to
// notice a filler word. Runs against transcript_verbatim only; transcript_clean
// has fillers removed by design, so there's nothing to detect there.
export function detectFillerWords(verbatimTranscript: string): FillerMatch[] {
  const matches: FillerMatch[] = [];
  FILLER_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FILLER_REGEX.exec(verbatimTranscript)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length, word: match[0] });
  }
  return matches;
}

export type FillerRateLabel = "not distracting" | "noticeable" | "distracting";

export interface FillerStats {
  count: number;
  ratePerMinute: number;
  label: FillerRateLabel;
}

export function labelForRate(ratePerMinute: number): FillerRateLabel {
  if (ratePerMinute <= 5) return "not distracting";
  if (ratePerMinute <= 10) return "noticeable";
  return "distracting";
}

// Thresholds from filler-word frequency research: ~5/min or fewer goes mostly
// unnoticed, ~a dozen/min is where it starts visibly hurting perceived
// competence. See plan notes for sources.
export function computeFillerStats(verbatimTranscript: string, durationSeconds: number): FillerStats {
  const count = detectFillerWords(verbatimTranscript).length;
  const minutes = Math.max(durationSeconds / 60, 1 / 60);
  const ratePerMinute = Math.round((count / minutes) * 10) / 10;
  return { count, ratePerMinute, label: labelForRate(ratePerMinute) };
}

export interface GeminiQuoteAnnotation {
  quote: string;
  category: Exclude<AnnotationCategory, "filler">;
  note: string;
}

export interface LocatedAnnotation extends LocatedSpan {
  category: AnnotationCategory;
  note: string;
}

// Gemini can't return character offsets reliably, so annotations are grounded
// locally: find a case-insensitive occurrence of the quoted text in the
// actual transcript, starting the search at `fromIndex`. Returns null if it
// can't be found — the caller drops the annotation from the inline view
// rather than guessing a wrong location.
//
// `fromIndex` lets a caller processing multiple annotations advance past
// spans it's already claimed, so if the same short quote is annotated more
// than once (e.g. a generic phrase that legitimately occurs several times),
// each annotation resolves to a distinct, later occurrence instead of every
// one collapsing onto the first match in the transcript.
export function locateQuote(transcript: string, quote: string, fromIndex = 0): LocatedSpan | null {
  const trimmedQuote = quote.trim();
  if (!trimmedQuote) return null;
  const index = transcript.toLowerCase().indexOf(trimmedQuote.toLowerCase(), fromIndex);
  if (index === -1) return null;
  return { start: index, end: index + trimmedQuote.length };
}

export interface TranscriptSegment {
  text: string;
  category: AnnotationCategory | null;
  note: string | null;
}

// Builds a flat, non-overlapping list of segments for rendering: filler
// matches claim their characters first (deterministic, exact), then Gemini
// annotations fill in only characters still unclaimed — so a Gemini quote
// that happens to contain a filler word doesn't fight it for color, filler
// always wins in the overlap.
export function buildHighlightSegments(transcript: string, annotations: LocatedAnnotation[]): TranscriptSegment[] {
  const categoryPerChar: (AnnotationCategory | null)[] = new Array(transcript.length).fill(null);
  const notePerChar: (string | null)[] = new Array(transcript.length).fill(null);

  const sorted = [...annotations].sort((a, b) => {
    if (a.category === "filler" && b.category !== "filler") return -1;
    if (b.category === "filler" && a.category !== "filler") return 1;
    return a.start - b.start;
  });

  for (const annotation of sorted) {
    for (let i = annotation.start; i < annotation.end && i < transcript.length; i++) {
      if (categoryPerChar[i] === null) {
        categoryPerChar[i] = annotation.category;
        notePerChar[i] = annotation.note;
      }
    }
  }

  const segments: TranscriptSegment[] = [];
  let segmentStart = 0;
  for (let i = 1; i <= transcript.length; i++) {
    const changed = i === transcript.length || categoryPerChar[i] !== categoryPerChar[segmentStart];
    if (changed) {
      segments.push({
        text: transcript.slice(segmentStart, i),
        category: categoryPerChar[segmentStart],
        note: notePerChar[segmentStart],
      });
      segmentStart = i;
    }
  }
  return segments;
}
