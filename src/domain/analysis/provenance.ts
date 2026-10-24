import type { Provenance } from "./types";

// Honest labels from a result's provenance: who made it and from what. The UI
// labels every result with these, never with a hard-coded provider. Pure.

const RULES_VERSION = "rules/2026-10-23";

export function rulesProvenance(at = new Date().toISOString()): Provenance {
  return { producer: "rules", promptVersion: RULES_VERSION, judged: false, at };
}

// "Judged by Tono AI (gemini-3.5-flash-lite) from your words and your phone's
// measurements."
export function provenanceLabel(p: Provenance | null | undefined): string {
  if (!p || p.producer === "rules") return "From measurements made on this phone.";
  const who = `${p.provider ?? "Tono AI"}${p.model ? ` (${p.model})` : ""}`;
  const from = p.input === "video" ? "after watching your take, with your words and your phone's measurements" : "from your words and your phone's measurements";
  return `Judged by ${who} ${from}.`;
}

// The short name for a chip or a caption: "Tono AI", "This phone".
export function producerName(p: Provenance | null | undefined): string {
  if (!p || p.producer === "rules") return "This phone";
  return p.provider ?? "Tono AI";
}
