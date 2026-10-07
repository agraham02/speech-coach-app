// A deliberately small phonetic key — not Double Metaphone, just enough to
// treat "bug"/"bog" or "peck"/"pec" as the same consonant skeleton. Used only
// to decide a *near* match (half credit), never a full hit, so its false
// positives are cheap.
export function phoneticKey(norm: string): string {
  if (!norm) return "";
  let w = norm.replace(/[^a-z]/g, "");
  if (!w) return norm;
  w = w
    .replace(/^kn/, "n")
    .replace(/^gn/, "n")
    .replace(/^wr/, "r")
    .replace(/^ps/, "s")
    .replace(/tch/g, "ch")
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/dg/g, "j")
    .replace(/wh/g, "w")
    .replace(/sh/g, "X")
    .replace(/ch/g, "C")
    .replace(/th/g, "0")
    .replace(/c(?=[eiy])/g, "s")
    .replace(/c/g, "k")
    .replace(/q/g, "k")
    .replace(/x/g, "ks")
    .replace(/z/g, "s")
    .replace(/gh/g, "")
    .replace(/(?!^)h/g, "")
    .replace(/e$/, "");
  const first = w[0];
  const rest = w.slice(1).replace(/[aeiouy]/g, "");
  const key = (/[aeiouy]/.test(first) ? "A" : first) + rest;
  return key.replace(/(.)\1+/g, "$1");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}
