import type { AnalysisContext, AnalysisKind } from "../../../domain/analysis/types";
import type { Route } from "../../../domain/analysis/routing";
import { autoMark } from "../../../domain/cadence/autoMark";
import { ruleCoach } from "../../../domain/coach/ruleCoach";
import { RULES_PROMPT_VERSION, type InputFor, type OutputFor } from "../kinds";
import { provenance, type AnalysisProvider, type ProviderOutcome } from "../provider";

// The rules: deterministic, on the phone, free, always there. They never
// judge; they read the measurements and the words with fixed rules, so the
// same take always gets the same answer.

export const rulesProvider: AnalysisProvider = {
  id: "rules",
  supports: (kind: AnalysisKind) => kind === "coaching" || kind === "mark_up",
  async run<K extends AnalysisKind>(kind: K, input: InputFor<K>, _ctx: AnalysisContext, _route: Route): Promise<ProviderOutcome<OutputFor<K>>> {
    const made = provenance({ producer: "rules", promptVersion: RULES_PROMPT_VERSION, judged: false });
    if (kind === "coaching") {
      const coach = ruleCoach(input as InputFor<"coaching">);
      return { ok: true, value: { ...coach, provenance: made } as OutputFor<K>, provenance: made };
    }
    if (kind === "mark_up") {
      return { ok: true, value: autoMark((input as InputFor<"mark_up">).text) as OutputFor<K>, provenance: made };
    }
    return { ok: false, reason: "unsupported" };
  },
};
