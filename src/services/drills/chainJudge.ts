import type { Provenance, Unavailable } from "../../domain/analysis/types";
import type { BridgeChainJudgement, WordChainJudgement } from "../../domain/drills/chainJudging";
import type { ChainJudgeRequest } from "../../domain/drills/evaluateDrill";
import { requestAnalysis } from "../analysis";
import { logger } from "../../utils/logger";

// Asking Tono AI whether a Word Chain or Bridge Chain attempt made sense,
// once, when the attempt ends (so the drill itself stays instant). Only the
// words of the attempt are sent: no audio, no account details beyond the
// sign-in the request already carries. Never throws; when the judge isn't
// there the screen scores by counting, and says so.

export type ChainJudged =
  | { ok: true; request: "word_chain"; judgement: WordChainJudgement; provenance: Provenance }
  | { ok: true; request: "bridge_chain"; judgement: BridgeChainJudgement; provenance: Provenance }
  | { ok: false; reason: Unavailable; message: string };

const ARGS = { hasVideo: false, hasTranscript: true, takeOptIn: true } as const;

// Why an attempt was counted, not checked, in a sentence for the result card.
export function whyNotChecked(reason: Unavailable, message?: string): string {
  switch (reason) {
    case "signed_out":
    case "not_entitled":
      return "With Tono Plus, Tono AI checks that each link makes sense. For now your words were counted.";
    case "quota":
    case "cost_cap":
    case "budget_paused":
      return "You've used your Tono AI checks for now, so your words were just counted.";
    case "no_consent":
      return "Allow Tono AI in Settings → Tono AI to have your links checked. For now your words were just counted.";
    case "offline":
      return "Couldn't reach Tono AI, so your words were just counted.";
    case "kill_switch":
      return "Tono AI is paused right now, so your words were just counted.";
    case "age_gate":
      return "Your words were counted on this phone.";
    case "unsupported":
    case "opted_out":
      return "Your words were counted on this phone. Tono AI can check each link.";
    default:
      return message ? `${message} Your words were just counted.` : "Couldn't check your links this time, so your words were just counted.";
  }
}

export async function judgeChain(request: ChainJudgeRequest): Promise<ChainJudged> {
  try {
    if (request.kind === "word_chain") {
      const result = await requestAnalysis("word_chain", request.input, ARGS);
      if (result.status === "done") return { ok: true, request: "word_chain", judgement: result.value, provenance: result.provenance };
      return { ok: false, reason: result.status === "unavailable" ? result.reason : "error", message: whyNotChecked(result.status === "unavailable" ? result.reason : "error", result.status === "unavailable" ? result.message : undefined) };
    }
    const result = await requestAnalysis("bridge_chain", request.input, ARGS);
    if (result.status === "done") return { ok: true, request: "bridge_chain", judgement: result.value, provenance: result.provenance };
    return { ok: false, reason: result.status === "unavailable" ? result.reason : "error", message: whyNotChecked(result.status === "unavailable" ? result.reason : "error", result.status === "unavailable" ? result.message : undefined) };
  } catch (error) {
    logger.warn(`[chain] judging failed — ${(error as Error).message}`);
    return { ok: false, reason: "error", message: whyNotChecked("error") };
  }
}
