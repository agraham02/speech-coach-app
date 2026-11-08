import { embed, type EmbeddingKind } from "../../../modules/tono-language";

// How close two words or two sentences are in meaning, by Apple's built-in
// embeddings (modules/tono-language). Cosine similarity: 1 is the same
// direction, 0 unrelated, negative opposed. Null means "can't check": no
// native module in this build, an unknown word, or no vector. The phone's content
// checks (docs/overhaul/PLAN.md, section 6.6) treat null as "not checked", never
// as a failure. Pure apart from the native call.

export function cosine(a: number[], b: number[]): number | null {
  if (a.length === 0 || a.length !== b.length) return null;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return null;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const clean = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

export async function similarity(kind: EmbeddingKind, a: string, b: string): Promise<number | null> {
  const [va, vb] = await Promise.all([embed(kind, clean(a)), embed(kind, clean(b))]);
  return va && vb ? cosine(va, vb) : null;
}
