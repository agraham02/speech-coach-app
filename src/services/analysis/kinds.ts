import type { AnalysisKind } from "../../domain/analysis/types";
import type { JudgedReview } from "../../domain/analysis/judgedReview";
import type { CoachInput, CoachOutput } from "../../domain/coach/ruleCoach";
import type { BridgeChainJudgement, BridgeSegment, ChainSegment, WordChainJudgement } from "../../domain/drills/chainJudging";
import type { MarkedText } from "../../domain/cadence/marks";
import type { PauseAnalysis } from "../../domain/dsp/pauses";
import type { PresenceMetrics } from "../../domain/presenceMetrics";
import type { RewindReview } from "../../domain/rewind/reviewPrompt";
import type { Session } from "../../domain/sessionTypes";
import type { SummarySetup } from "../../domain/summary/prepareSummary";
import type { SummaryReview } from "../../domain/summary/summaryReviewPrompt";
import type { TokenUsage } from "../../domain/cloudUsage";
import type { GradingContext } from "../sessions/sessionSubject";

// One typed input and one typed result shape per kind. A screen or step only
// ever sees these; how a provider gets there (which model, which prompt,
// uploads) stays inside the provider, and the prompts themselves live on the
// server (supabase/functions/_shared/prompts).

export interface TakeReviewInput {
  session: Session;
  context: GradingContext;
  pauses: PauseAnalysis | null;
  presence: PresenceMetrics | null;
  stutterMode: boolean;
}

export interface TakeReviewOutput {
  // The judgement in the taxonomy's terms (domain/analysis/judgedReview.ts),
  // already checked. The judged score sheet is read from it.
  review: JudgedReview;
  // True when the judge wrote the transcript from the audio (a video take
  // with no phone transcript).
  heardAudio: boolean;
  usage: TokenUsage | null;
  elapsedMs: number;
  videoBytes: number | null;
}

export interface RewindNotesInput {
  transcript: string;
}

// A Word Chain attempt, split into the runs between start words (the phone's
// own split: domain/drills/chainJudging.ts). Only these words are sent.
export interface WordChainInput {
  segments: ChainSegment[];
}

export interface BridgeChainInput {
  segments: BridgeSegment[];
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
  word_chain: WordChainInput;
  bridge_chain: BridgeChainInput;
  summary_notes: SummaryNotesInput;
  mark_up: MarkUpInput;
}

export interface OutputMap {
  take_review: TakeReviewOutput;
  coaching: CoachOutput;
  rewind_notes: RewindReview;
  word_chain: WordChainJudgement;
  bridge_chain: BridgeChainJudgement;
  summary_notes: SummaryReview;
  mark_up: MarkedText;
}

export type InputFor<K extends AnalysisKind> = InputMap[K];
export type OutputFor<K extends AnalysisKind> = OutputMap[K];

// The rules' version, recorded in their provenance. A Tono AI result records
// the prompt version the server reports.
export const RULES_PROMPT_VERSION = "rules/2026-10-23";
