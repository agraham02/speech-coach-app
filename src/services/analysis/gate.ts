import type { AnalysisKind } from "../../domain/analysis/types";
import { readyForTono } from "../cloud/consent";

// What has to be true before a judged analysis is asked for on someone's
// behalf, asked in the moment when it isn't (allow sending, or Plus for an
// exercise). App Review 5.1.2(i): say where the data goes and get permission
// first. Resolves true when it's fine to go ahead. The AnalysisService itself
// never asks anything; this is the one place that does.
//
// Tono AI needs a sign-in (Apple or Google) and a birthday: readyForTono asks
// for them here, in the moment. `openSettings` is kept for callers that pass it.
export async function prepareFor(kind: AnalysisKind, _openSettings?: () => void): Promise<boolean> {
  if (kind === "coaching") return true;
  return readyForTono({ exercise: kind !== "take_review" });
}
