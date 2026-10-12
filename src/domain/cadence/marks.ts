import { tokenizeScript } from "../scriptTypes";

// Delivery marks on a text — the notation for Mark It Up and the Speeches
// shelf. Word indices are positions in tokenizeScript(text) (whitespace
// tokens, punctuation attached), the same rule the teleprompter and the
// Gemini script prompt use, so they never drift apart. Pure.

export type PointMarkKind = "emphasis" | "rise" | "fall";
export type GapMarkKind = "pause" | "long_pause";
export type SpanMarkKind = "slow" | "fast" | "louder" | "softer";
export type MarkKind = PointMarkKind | GapMarkKind | SpanMarkKind | "note";

export type Mark =
  // emphasis on the word; rise/fall on the END of the word
  | { kind: PointMarkKind; word: number }
  // in the gap after the word
  | { kind: GapMarkKind; afterWord: number }
  | { kind: SpanMarkKind; from: number; to: number }
  // tone direction shown above the phrase this word starts
  | { kind: "note"; word: number; text: string };

export interface MarkedText {
  text: string;
  marks: Mark[];
}

export const POINT_KINDS: PointMarkKind[] = ["emphasis", "rise", "fall"];
export const GAP_KINDS: GapMarkKind[] = ["pause", "long_pause"];
export const SPAN_KINDS: SpanMarkKind[] = ["slow", "fast", "louder", "softer"];

export function isPoint(m: Mark): m is Extract<Mark, { kind: PointMarkKind }> {
  return (POINT_KINDS as string[]).includes(m.kind);
}
export function isGap(m: Mark): m is Extract<Mark, { kind: GapMarkKind }> {
  return (GAP_KINDS as string[]).includes(m.kind);
}
export function isSpan(m: Mark): m is Extract<Mark, { kind: SpanMarkKind }> {
  return (SPAN_KINDS as string[]).includes(m.kind);
}

export function wordsOf(text: string): string[] {
  return text.trim() ? tokenizeScript(text) : [];
}

// What the reader needs per word, precomputed once for rendering.
export interface WordMarks {
  word: string;
  emphasis: boolean;
  inflection: "rise" | "fall" | null;
  gapAfter: GapMarkKind | null;
  spans: SpanMarkKind[];
  note: string | null;
}

export function marksByWord(marked: MarkedText): WordMarks[] {
  const words = wordsOf(marked.text);
  const out: WordMarks[] = words.map((word) => ({ word, emphasis: false, inflection: null, gapAfter: null, spans: [], note: null }));
  for (const m of marked.marks) {
    if (isPoint(m)) {
      const w = out[m.word];
      if (!w) continue;
      if (m.kind === "emphasis") w.emphasis = true;
      else w.inflection = m.kind;
    } else if (isGap(m)) {
      const w = out[m.afterWord];
      // A long pause wins over a short one at the same gap.
      if (w && w.gapAfter !== "long_pause") w.gapAfter = m.kind;
    } else if (isSpan(m)) {
      for (let i = Math.max(0, m.from); i <= Math.min(out.length - 1, m.to); i++) {
        if (!out[i].spans.includes(m.kind)) out[i].spans.push(m.kind);
      }
    } else if (out[m.word]) {
      out[m.word].note = m.text;
    }
  }
  return out;
}

// Breath groups: the text split after every pause mark. Each group is a
// range of word indices [from, to].
export function phrases(marked: MarkedText): { from: number; to: number }[] {
  const words = marksByWord(marked);
  const out: { from: number; to: number }[] = [];
  let from = 0;
  words.forEach((w, i) => {
    if (w.gapAfter || i === words.length - 1) {
      out.push({ from, to: i });
      from = i + 1;
    }
  });
  return out;
}

// Which marks a reader sees: everything, just pauses and stress, or none.
export type MarkLevel = "full" | "light" | "none";

export function filterMarks(marks: Mark[], level: MarkLevel, hidden: ReadonlySet<MarkKind> = new Set()): Mark[] {
  if (level === "none") return [];
  return marks.filter((m) => {
    if (hidden.has(m.kind)) return false;
    if (level === "light") return m.kind === "emphasis" || isGap(m);
    return true;
  });
}

export function countByKind(marks: Mark[]): Partial<Record<MarkKind, number>> {
  const out: Partial<Record<MarkKind, number>> = {};
  for (const m of marks) out[m.kind] = (out[m.kind] ?? 0) + 1;
  return out;
}

// Drops anything that points outside the text, and duplicates — used on
// marks that came from a model or an old save.
export function sanitizeMarks(marks: Mark[], wordCount: number): Mark[] {
  const seen = new Set<string>();
  const inRange = (i: number) => Number.isInteger(i) && i >= 0 && i < wordCount;
  const out: Mark[] = [];
  for (const m of marks) {
    let key: string;
    if (isPoint(m)) {
      if (!inRange(m.word)) continue;
      // one inflection per word: the later one wins below by key
      key = m.kind === "emphasis" ? `e:${m.word}` : `i:${m.word}`;
    } else if (isGap(m)) {
      if (!inRange(m.afterWord) || m.afterWord === wordCount - 1) continue;
      key = `g:${m.afterWord}`;
    } else if (isSpan(m)) {
      if (!inRange(m.from) || !inRange(m.to) || m.to < m.from) continue;
      key = `s:${m.kind}:${m.from}:${m.to}`;
    } else if (m.kind === "note") {
      if (!inRange(m.word) || !m.text.trim()) continue;
      key = `n:${m.word}`;
    } else {
      continue;
    }
    if (seen.has(key)) {
      const idx = out.findIndex((o) => markKey(o) === key);
      if (idx >= 0) out[idx] = m;
      continue;
    }
    seen.add(key);
    out.push(m);
  }
  return out;
}

function markKey(m: Mark): string {
  if (isPoint(m)) return m.kind === "emphasis" ? `e:${m.word}` : `i:${m.word}`;
  if (isGap(m)) return `g:${m.afterWord}`;
  if (isSpan(m)) return `s:${m.kind}:${m.from}:${m.to}`;
  return `n:${m.word}`;
}

// ---------------------------------------------------------------------------
// Editing (pure helpers the editor calls)
// ---------------------------------------------------------------------------

export function toggleEmphasis(marks: Mark[], word: number): Mark[] {
  const has = marks.some((m) => m.kind === "emphasis" && m.word === word);
  return has ? marks.filter((m) => !(m.kind === "emphasis" && m.word === word)) : [...marks, { kind: "emphasis", word }];
}

// Sets rise or fall on a word; tapping the same one again clears it.
export function toggleInflection(marks: Mark[], word: number, kind: "rise" | "fall"): Mark[] {
  const current = marks.find((m): m is { kind: "rise" | "fall"; word: number } => (m.kind === "rise" || m.kind === "fall") && m.word === word);
  const rest = marks.filter((m) => !((m.kind === "rise" || m.kind === "fall") && m.word === word));
  return current?.kind === kind ? rest : [...rest, { kind, word }];
}

// Cycles the gap after a word: none → pause → long pause → none.
export function cycleGap(marks: Mark[], afterWord: number): Mark[] {
  const current = marks.find((m) => isGap(m) && m.afterWord === afterWord);
  const rest = marks.filter((m) => !(isGap(m) && m.afterWord === afterWord));
  if (!current) return [...rest, { kind: "pause", afterWord }];
  if (current.kind === "pause") return [...rest, { kind: "long_pause", afterWord }];
  return rest;
}

export function setGap(marks: Mark[], afterWord: number, kind: GapMarkKind | null): Mark[] {
  const rest = marks.filter((m) => !(isGap(m) && m.afterWord === afterWord));
  return kind ? [...rest, { kind, afterWord }] : rest;
}

export function addSpan(marks: Mark[], kind: SpanMarkKind, a: number, b: number): Mark[] {
  const from = Math.min(a, b);
  const to = Math.max(a, b);
  // A new span replaces any same-kind span it overlaps.
  const rest = marks.filter((m) => !(m.kind === kind && isSpan(m) && m.from <= to && m.to >= from));
  return [...rest, { kind, from, to }];
}

export function setNote(marks: Mark[], word: number, text: string): Mark[] {
  const rest = marks.filter((m) => !(m.kind === "note" && m.word === word));
  return text.trim() ? [...rest, { kind: "note", word, text: text.trim() }] : rest;
}

// The eraser: everything on a word — stress, inflection, the gap after it,
// a note, and any span that touches it.
export function clearWord(marks: Mark[], word: number): Mark[] {
  return marks.filter((m) => {
    if (isPoint(m) || m.kind === "note") return m.word !== word;
    if (isGap(m)) return m.afterWord !== word;
    return !(m.from <= word && m.to >= word);
  });
}

// ---------------------------------------------------------------------------
// Compare (your marks vs the coach's)
// ---------------------------------------------------------------------------

export interface MarkComparison {
  // positions where both put the same kind of mark
  shared: number;
  // on yours only / the coach's only
  mineOnly: number;
  coachOnly: number;
}

// Pauses compare by position only (short vs long counts as agreeing);
// inflections and stress by word and kind. Spans and notes aren't compared.
export function compareMarks(mine: Mark[], coach: Mark[]): MarkComparison {
  const keys = (marks: Mark[]) =>
    new Set(
      marks.flatMap((m) => {
        if (isGap(m)) return [`g:${m.afterWord}`];
        if (isPoint(m)) return [`${m.kind}:${m.word}`];
        return [];
      }),
    );
  const a = keys(mine);
  const b = keys(coach);
  let shared = 0;
  a.forEach((k) => {
    if (b.has(k)) shared += 1;
  });
  return { shared, mineOnly: a.size - shared, coachOnly: b.size - shared };
}

// Keeps only the kinds a learner is given at their level, so they mark the
// rest themselves.
export function keepKinds(marks: Mark[], kinds: MarkKind[]): Mark[] {
  return marks.filter((m) => kinds.includes(m.kind));
}

// One stretch of a marked text (a breath group in Rehearse), with its marks
// re-indexed. Spans are clipped to the stretch; a pause after its last word
// is kept so the line still shows where the breath goes.
export function sliceMarked(marked: MarkedText, from: number, to: number): MarkedText {
  const words = wordsOf(marked.text).slice(from, to + 1);
  const inside = (i: number) => i >= from && i <= to;
  const marks: Mark[] = [];
  for (const m of marked.marks) {
    if (isPoint(m) || m.kind === "note") {
      if (inside(m.word)) marks.push({ ...m, word: m.word - from });
    } else if (isGap(m)) {
      if (inside(m.afterWord)) marks.push({ ...m, afterWord: m.afterWord - from });
    } else if (m.to >= from && m.from <= to) {
      marks.push({ kind: m.kind, from: Math.max(m.from, from) - from, to: Math.min(m.to, to) - from });
    }
  }
  return { text: words.join(" "), marks };
}
