import { autoMark } from "../../domain/cadence/autoMark";
import type { MarkedText } from "../../domain/cadence/marks";
import type { Provenance } from "../../domain/analysis/types";
import { requestAnalysis } from "../analysis";
import { logger } from "../../utils/logger";

// Who marked it: Tono AI, or the marking-guide rules.
export type MarkedBy = "tono" | "rules";

// Marks a text for reading aloud through the AnalysisService: Tono AI when it
// is available (signed in, allowed, a text call left), the marking-guide rules
// otherwise. Only the one or two sentences chosen are sent. Tono AI's marks
// are kept only when the words come back exactly as given. Never throws.
export async function autoMarkText(text: string): Promise<{ marked: MarkedText; by: MarkedBy; provenance?: Provenance }> {
  // The rules tidy the text first (spacing, quotes), and that's what is marked.
  const rules = autoMark(text);
  try {
    // Choosing a sentence to mark is the opt-in.
    const result = await requestAnalysis("mark_up", { text: rules.text }, { hasVideo: false, hasTranscript: true, takeOptIn: true });
    if (result.status === "done") return { marked: result.value, by: result.provenance.producer === "tono_ai" ? "tono" : "rules", provenance: result.provenance };
    if (result.status === "unavailable") logger.warn(`[autoMarkText] Tono AI didn't mark it (${result.reason}) — using the phone`);
  } catch (error) {
    logger.warn(`[autoMarkText] marking failed, using the rules — ${(error as Error).message}`);
  }
  return { marked: rules, by: "rules" };
}
