// Checking what an AI claims was said against what was actually said. A judge
// is asked to quote the words it relies on; the phone checks every quote
// against the transcript before showing it (docs/decisions/exercise-judging.md).
// Pure.

// Lowercase, no punctuation, single spaces: so "Today, I woke up" and
// "today i woke up" are the same words.
export function normalizeWords(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function wordsOf(text: string): string[] {
  const n = normalizeWords(text);
  return n ? n.split(" ") : [];
}

// Whether `quote` appears in `source` word for word (case and punctuation
// aside). A quote of no words never counts.
export function quoteIn(quote: string, source: string): boolean {
  const q = normalizeWords(quote);
  if (!q) return false;
  return ` ${normalizeWords(source)} `.includes(` ${q} `);
}

// A claimed quote that is nearly right (a dropped "the", a fixed word) snapped
// to the transcript's own words: the best run of words in `source` that holds
// at least `minRecall` of the claimed words and is about as long. Returns the
// transcript's words as they were said, or null when nothing is close enough.
export function snapToSource(quote: string, source: string, minRecall = 0.8): string | null {
  const wanted = wordsOf(quote);
  if (wanted.length < 3) return null;
  const raw = source.split(/\s+/).filter(Boolean);
  const norm = raw.map((r) => normalizeWords(r).replace(/ /g, ""));
  const want = new Map<string, number>();
  for (const w of wanted) want.set(w, (want.get(w) ?? 0) + 1);

  let best: { start: number; end: number; recall: number } | null = null;
  const min = Math.max(2, Math.floor(wanted.length * 0.8));
  const max = Math.ceil(wanted.length * 1.25);
  for (let start = 0; start < raw.length; start++) {
    if (!norm[start]) continue;
    const left = new Map(want);
    let hit = 0;
    let taken = 0;
    for (let end = start; end < raw.length && taken < max; end++) {
      if (!norm[end]) continue;
      taken += 1;
      const have = left.get(norm[end]) ?? 0;
      if (have > 0) {
        left.set(norm[end], have - 1);
        hit += 1;
      }
      const recall = hit / wanted.length;
      // Prefer the higher recall, then the shorter run; the run must end on a
      // matched word so the snap never trails off into other words.
      if (taken >= min && have > 0 && recall >= minRecall && (!best || recall > best.recall + 1e-9 || (Math.abs(recall - best.recall) < 1e-9 && end - start < best.end - best.start))) {
        best = { start, end, recall };
      }
    }
  }
  if (!best) return null;
  return raw.slice(best.start, best.end + 1).join(" ").replace(/^[^A-Za-z0-9]+|[,;:.!?\s]+$/g, "");
}
