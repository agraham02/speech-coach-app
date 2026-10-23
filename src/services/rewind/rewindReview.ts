import type { RewindReview } from "../../domain/rewind/reviewPrompt";
import type { Provenance } from "../../domain/analysis/types";
import { requestAnalysis } from "../analysis";
import { prepareFor } from "../analysis/gate";
import { wordCount } from "../cloud/inputGuards";

// The coach's notes on a Rewind take, through the AnalysisService: written
// from the transcript only (the words, never the sound) and never a score
// (domain/rewind/reviewPrompt.ts). Only on request, per take.

// Too short to say anything about.
const MIN_REVIEW_WORDS = 25;

export type CloudReviewResult = { ok: true; review: RewindReview; provenance: Provenance } | { ok: false; message: string | null };

// Notes on request. Resolves with why it didn't happen, rather than throwing,
// so the screen can say so plainly (message null: the person declined).
export async function reviewInCloud(transcript: string, openSettings: () => void): Promise<CloudReviewResult> {
  if (wordCount(transcript) < MIN_REVIEW_WORDS) return { ok: false, message: "There isn't enough here to write notes on yet — try a little longer next time." };
  if (!(await prepareFor("rewind_notes", openSettings))) return { ok: false, message: null };
  const result = await requestAnalysis("rewind_notes", { transcript }, { hasVideo: false, hasTranscript: true, takeOptIn: true });
  if (result.status === "done") return { ok: true, review: result.value, provenance: result.provenance };
  return { ok: false, message: result.status === "unavailable" ? (result.message ?? "Couldn't get notes right now. Try again in a moment.") : null };
}
