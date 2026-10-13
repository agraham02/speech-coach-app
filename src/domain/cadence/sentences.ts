// Splits pasted or scanned text into sentences so you can pick one or two to
// practice. Pure.

const ABBREVIATIONS = new Set(["mr", "mrs", "ms", "dr", "prof", "st", "jr", "sr", "vs", "etc", "e.g", "i.e", "no", "fig", "inc", "ltd", "co", "mt", "approx"]);

export function splitSentences(text: string): string[] {
  // Scanned pages break lines mid-sentence and hyphenate words across them.
  const flat = text
    .replace(/(\w)-\n(\w)/g, "$1$2")
    .replace(/\s*\n\s*\n\s*/g, " ¶ ")
    .replace(/\s+/g, " ")
    .trim();
  if (!flat) return [];
  const tokens = flat.split(" ");
  const out: string[] = [];
  let current: string[] = [];
  const flush = () => {
    const s = current.join(" ").trim();
    if (s) out.push(s);
    current = [];
  };
  tokens.forEach((token, i) => {
    if (token === "¶") {
      flush();
      return;
    }
    current.push(token);
    const next = tokens[i + 1];
    const end = /[.!?]+["'”’)\]]*$/.test(token);
    if (!end) return;
    const word = token.toLowerCase().replace(/[.!?"'”’)\]]+$/, "");
    // "Dr. Smith", "e.g. this" — not the end of a sentence.
    if (ABBREVIATIONS.has(word) || /^[a-z]$/i.test(word)) return;
    // "…and then. 3 apples" is rare; a lowercase next word usually means an
    // abbreviation or a quote, so keep going.
    if (next && next !== "¶" && /^[a-z]/.test(next)) return;
    flush();
  });
  flush();
  return out;
}

export function countSentences(text: string): number {
  return splitSentences(text).length;
}
