// "repeated_words" is app-local only (like "filler") — Gemini never emits
// it; see the Gemini-schema-constrained AnnotationCategory in
// services/gemini/types.ts, which must NOT gain this value.
export type AnnotationCategory =
  | "filler"
  | "structure"
  | "delivery"
  | "presence"
  | "content"
  | "restated_point"
  | "repeated_words";

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

export interface RepeatedWordMatch {
  quote: string; // e.g. "my my my", "the the" — resolved to a span via locateQuote (below)
}

function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

// Shared run-detection over any {text}[] token sequence — scans for runs of
// >=2 consecutive tokens that are identical once lowercased/punctuation-
// stripped (e.g. "my my my", "the the"). This is a secondary, stutter-
// adjacent signal, distinct from (and not to be confused with) the semantic
// idea-level repetition `restated_point` already flags — literal word
// repetition and restating a point in different words are different
// phenomena. Deliberately not called "stutter" anywhere in UI copy.
function detectRepeatedRuns(tokens: { text: string }[]): RepeatedWordMatch[] {
  const matches: RepeatedWordMatch[] = [];
  let runStart = 0;
  for (let i = 1; i <= tokens.length; i++) {
    const prevNormalized = normalizeToken(tokens[i - 1].text);
    const sameAsPrev = i < tokens.length && normalizeToken(tokens[i].text) === prevNormalized && prevNormalized.length > 0;
    if (!sameAsPrev) {
      if (i - runStart >= 2) {
        matches.push({ quote: tokens.slice(runStart, i).map((t) => t.text).join(" ") });
      }
      runStart = i;
    }
  }
  return matches;
}

// Preferred path — uses word-level tokens from on-device ASR or AssemblyAI
// (see sessionProcessor.ts), which tokenize more reliably than a naive
// whitespace split (handles punctuation attached to words correctly).
export function detectRepeatedWordsFromWords(words: { text: string }[]): RepeatedWordMatch[] {
  return detectRepeatedRuns(words);
}

// Last-resort fallback — whitespace-tokenized scan over raw transcript text,
// used only when no word-level array is available (both on-device ASR and
// AssemblyAI unavailable/failed, Gemini self-transcribed instead).
export function detectRepeatedWordsFromText(text: string): RepeatedWordMatch[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  return detectRepeatedRuns(tokens.map((t) => ({ text: t })));
}

export interface GeminiQuoteAnnotation {
  quote: string;
  // Gemini can never emit "filler" or "repeated_words" — both are on-device-
  // only categories (see the naming note on AnnotationCategory above).
  category: Exclude<AnnotationCategory, "filler" | "repeated_words">;
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

  // Deterministic, on-device categories (filler, repeated_words) claim their
  // characters before Gemini's quote-based annotations, so a Gemini quote
  // that happens to overlap a filler word or a repeated run doesn't fight it
  // for color — the deterministic signal always wins the overlap.
  const isDeterministic = (category: AnnotationCategory) => category === "filler" || category === "repeated_words";
  const sorted = [...annotations].sort((a, b) => {
    if (isDeterministic(a.category) && !isDeterministic(b.category)) return -1;
    if (isDeterministic(b.category) && !isDeterministic(a.category)) return 1;
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
