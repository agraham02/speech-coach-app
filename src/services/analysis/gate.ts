import type { AnalysisKind } from "../../domain/analysis/types";
import { readyForTono } from "../cloud/consent";

// What has to be true before a judged analysis is asked for on someone's
// behalf, asked in the moment when it isn't (allow sending, or Plus for an
// exercise). App Review 5.1.2(i): say where the data goes and get permission
// first. Resolves true when it's fine to go ahead. The AnalysisService itself
// never asks anything; this is the one place that does.
//
// Nobody is asked to sign in: an anonymous account is made behind the scenes
// when it's first needed. `openSettings` is kept for callers that pass it.
export async function prepareFor(kind: AnalysisKind, _openSettings?: () => void): Promise<boolean> {
  if (kind === "coaching") return true;
  return readyForTono({ exercise: kind !== "take_review" });
}
