import { SPAN_KINDS, isGap, isPoint, isSpan, marksByWord, type Mark, type MarkedText, type SpanMarkKind } from "./marks";

// A compact plain-text notation for writing marked lines by hand, so the
// built-in content stays readable in source:
//
//   *Thirty* seconds↘ || That's about how long I have | before you check
//   your *phone*↗ | so let's not *waste* it↘ ||
//
//   *word*        stress (punctuation may sit inside or after: *phone,*)
//   word↗ word↘   rising / falling inflection on the end of the word
//   |  ||         short / long pause in the gap after the previous word
//   {slow … }     a span — slow, fast, louder or softer; `}` closes it on
//                 the word it's attached to (or the previous word if alone)
//   [[note]]      tone direction, shown above the phrase of the next word
//
// Pure.

export function parseNotation(source: string): MarkedText {
  const notes: string[] = [];
  const prepared = source.replace(/\[\[([\s\S]+?)\]\]/g, (_, note: string) => {
    notes.push(note.trim());
    return ` ⟦${notes.length - 1}⟧ `;
  });
  const words: string[] = [];
  const marks: Mark[] = [];
  const open: { kind: SpanMarkKind; from: number }[] = [];
  let pendingNote: string | null = null;

  const addGap = (kind: "pause" | "long_pause") => {
    if (!words.length) return;
    const afterWord = words.length - 1;
    const existing = marks.findIndex((m) => isGap(m) && m.afterWord === afterWord);
    if (existing >= 0) marks.splice(existing, 1);
    marks.push({ kind, afterWord });
  };
  const closeSpan = (at: number) => {
    const span = open.pop();
    if (span && at >= span.from) marks.push({ kind: span.kind, from: span.from, to: at });
  };

  for (const token of prepared.split(/\s+/).filter(Boolean)) {
    const note = /^⟦(\d+)⟧$/.exec(token);
    if (note) {
      pendingNote = notes[Number(note[1])] ?? null;
      continue;
    }
    if (token === "|" || token === "||") {
      addGap(token === "||" ? "long_pause" : "pause");
      continue;
    }
    if (token.startsWith("{") && (SPAN_KINDS as string[]).includes(token.slice(1))) {
      open.push({ kind: token.slice(1) as SpanMarkKind, from: words.length });
      continue;
    }
    if (token === "}") {
      closeSpan(words.length - 1);
      continue;
    }

    // Peel decorations off the end: gaps, span closers, an arrow.
    let t = token;
    let gap: "pause" | "long_pause" | null = null;
    let closes = 0;
    let inflection: "rise" | "fall" | null = null;
    for (let changed = true; changed; ) {
      changed = false;
      if (t.endsWith("||")) {
        gap = "long_pause";
        t = t.slice(0, -2);
        changed = true;
      } else if (t.endsWith("|")) {
        gap = gap ?? "pause";
        t = t.slice(0, -1);
        changed = true;
      } else if (t.endsWith("}")) {
        closes += 1;
        t = t.slice(0, -1);
        changed = true;
      } else if (t.endsWith("↗") || t.endsWith("↘")) {
        inflection = t.endsWith("↗") ? "rise" : "fall";
        t = t.slice(0, -1);
        changed = true;
      }
    }
    let emphasis = false;
    if (t.startsWith("*") && t.length > 1) {
      emphasis = true;
      t = t.slice(1);
      const last = t.lastIndexOf("*");
      if (last >= 0) t = t.slice(0, last) + t.slice(last + 1);
    }
    if (!t) continue;

    const index = words.length;
    words.push(t);
    if (emphasis) marks.push({ kind: "emphasis", word: index });
    if (inflection) marks.push({ kind: inflection, word: index });
    if (pendingNote) {
      marks.push({ kind: "note", word: index, text: pendingNote });
      pendingNote = null;
    }
    for (let i = 0; i < closes; i++) closeSpan(index);
    if (gap) addGap(gap);
  }
  // Unclosed spans run to the end.
  while (open.length) closeSpan(words.length - 1);
  return { text: words.join(" "), marks };
}

// The inverse — used by tests and when exporting a marked text.
export function toNotation(marked: MarkedText): string {
  const words = marksByWord(marked);
  const spanStarts = new Map<number, SpanMarkKind[]>();
  const spanEnds = new Map<number, number>();
  for (const m of marked.marks) {
    if (!isSpan(m)) continue;
    spanStarts.set(m.from, [...(spanStarts.get(m.from) ?? []), m.kind]);
    spanEnds.set(m.to, (spanEnds.get(m.to) ?? 0) + 1);
  }
  const parts: string[] = [];
  words.forEach((w, i) => {
    if (w.note) parts.push(`[[${w.note}]]`);
    for (const kind of spanStarts.get(i) ?? []) parts.push(`{${kind}`);
    let token = w.emphasis ? `*${w.word}*` : w.word;
    if (w.inflection) token += w.inflection === "rise" ? "↗" : "↘";
    token += "}".repeat(spanEnds.get(i) ?? 0);
    parts.push(token);
    if (w.gapAfter) parts.push(w.gapAfter === "long_pause" ? "||" : "|");
  });
  return parts.join(" ");
}

// Plain counts, for a card's "12 marks" line.
export function markSummary(marks: Mark[]): { pauses: number; inflections: number; stresses: number; spans: number } {
  return {
    pauses: marks.filter(isGap).length,
    inflections: marks.filter((m) => isPoint(m) && m.kind !== "emphasis").length,
    stresses: marks.filter((m) => m.kind === "emphasis").length,
    spans: marks.filter(isSpan).length,
  };
}
