import type { AnalysisKind } from "../../domain/analysis/types";
import type { CoachInput, CoachOutput } from "../../domain/coach/ruleCoach";
import type { MarkedText } from "../../domain/cadence/marks";
import type { PauseAnalysis } from "../../domain/dsp/pauses";
import type { PresenceMetrics } from "../../domain/presenceMetrics";
import type { RewindReview } from "../../domain/rewind/reviewPrompt";
import type { Session } from "../../domain/sessionTypes";
import type { SummarySetup } from "../../domain/summary/prepareSummary";
import type { SummaryReview } from "../../domain/summary/summaryReviewPrompt";
import type { TokenUsage } from "../../domain/cloudUsage";
import type { GradingContext } from "../gemini/transcribeSession";
import type { GeminiSessionAnalysis } from "../gemini/types";
import type { ProviderId } from "../cloud/providers";

// One typed input and one typed result shape per kind. A screen or step only
// ever sees these; how a provider gets there (which model, which prompt,
// uploads, keys) stays inside the provider.

export interface TakeReviewInput {
  session: Session;
  context: GradingContext;
  pauses: PauseAnalysis | null;
  presence: PresenceMetrics | null;
  stutterMode: boolean;
}

export interface TakeReviewOutput {
  // The review rubric. The scores row is written from it, and the judged
  // score sheet is read from that (domain/scoring/takeScore.ts).
  analysis: GeminiSessionAnalysis;
  // The coach card written in the same call, checked later (cloudCoach.ts).
  quickCoach: unknown | null;
  // True when the judge transcribed the audio itself.
  heardAudio: boolean;
  usage: TokenUsage | null;
  elapsedMs: number;
  videoBytes: number | null;
  // For the token-usage record (cloud_usage), which keeps provider ids.
  providerId: ProviderId;
}

export interface RewindNotesInput {
  transcript: string;
}

export interface SummaryNotesInput {
  setup: SummarySetup;
  transcripts: string[];
}

export interface MarkUpInput {
  text: string;
}

export interface InputMap {
  take_review: TakeReviewInput;
  coaching: CoachInput;
  rewind_notes: RewindNotesInput;
  summary_notes: SummaryNotesInput;
  mark_up: MarkUpInput;
}

export interface OutputMap {
  take_review: TakeReviewOutput;
  coaching: CoachOutput;
  rewind_notes: RewindReview;
  summary_notes: SummaryReview;
  mark_up: MarkedText;
}

export type InputFor<K extends AnalysisKind> = InputMap[K];
export type OutputFor<K extends AnalysisKind> = OutputMap[K];

// The prompt template behind each result, recorded in its provenance so a
// change of prompt is traceable. Session 08 moves the templates to the
// server, which then reports the version it used.
export const PROMPT_VERSIONS = {
  take_review_text: "take-review-text/2026-10-23",
  take_review_video: "take-review-video/2026-10-23",
  rewind_notes: "rewind-notes/2026-10-18",
  summary_notes: "summary-notes/2026-10-17",
  mark_up: "mark-up/2026-10-19",
  rules: "rules/2026-10-23",
} as const;
