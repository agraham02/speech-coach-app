import type { SummarySetup } from "../../domain/summary/prepareSummary";
import type { SummaryReview } from "../../domain/summary/summaryReviewPrompt";
import type { Provenance } from "../../domain/analysis/types";
import { MAX_REVIEW_WORDS, wordCount } from "../cloud/inputGuards";
import { requestAnalysis } from "../analysis";

// The AI's notes on a spoken summary (domain/summary/summaryReviewPrompt.ts),
// through the AnalysisService. Only the words are sent. Never throws: no
// review means the drill scores on what the phone measured and shows the
// written example.

// Too little said to say anything about.
const MIN_WORDS = 4;

export interface SummaryReviewResult {
  review: SummaryReview;
  // Who wrote it, for the label.
  provenance: Provenance;
}

export async function reviewSummary(setup: SummarySetup, transcripts: string[]): Promise<SummaryReviewResult | null> {
  const total = transcripts.join(" ");
  if (wordCount(total) < MIN_WORDS || wordCount(total) > MAX_REVIEW_WORDS) return null;
  try {
    // The "Review every take" default decides, as it always has here.
    const result = await requestAnalysis("summary_notes", { setup, transcripts }, { hasVideo: false, hasTranscript: true });
    return result.status === "done" ? { review: result.value, provenance: result.provenance } : null;
  } catch {
    return null;
  }
}
