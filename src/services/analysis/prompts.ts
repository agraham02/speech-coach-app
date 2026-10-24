import { AUTO_MARK_DATA_NOTE, AUTO_MARK_JSON_SCHEMA, AUTO_MARK_SYSTEM, buildAutoMarkPrompt } from "../../domain/cadence/autoMarkPrompt";
import { defaultsFromProfile } from "../../domain/profile";
import { REWIND_REVIEW_SYSTEM, buildRewindReviewPrompt } from "../../domain/rewind/reviewPrompt";
import { buildSummaryReviewPrompt, jsonSchemaFor, SUMMARY_REVIEW_SYSTEM } from "../../domain/summary/summaryReviewPrompt";
import { fenced } from "../cloud/inputGuards";
import { measuredReviewRequest } from "../cloud/measuredReview";
import { speakerContextForReview } from "../cloud/speakerContext";
import { SPEECH_IS_DATA, STUTTER_NOTE } from "../gemini/schema";
import { getUserProfile } from "../prefs/prefsStore";
import type { MarkUpInput, RewindNotesInput, SummaryNotesInput, TakeReviewInput } from "./kinds";

// Every prompt an AI judge is sent, built from the kind's typed input, in one
// place. No screen, component or step builds a prompt any more. Session 08
// moves these templates to the server: the Tono AI provider will then send
// the same typed inputs ({kind, inputs, schemaVersion}) and the server builds
// the request with these functions. The video review's prompt is built in
// services/gemini/transcribeSession.ts (analyzeUploadedVideo), which moves
// with it.

export interface TextRequest {
  system: string;
  user: string;
  // Plain JSON Schema (Gemini's subset).
  schema: object;
}

// The take judged from its transcript and the phone's measurements.
export function takeReviewTextRequest(input: TakeReviewInput, withCoach: boolean): TextRequest {
  return measuredReviewRequest(input, { withCoach });
}

const REWIND_FIELDS = ["specificity", "storytelling", "flow", "coverage", "vividDetail", "tryTomorrow"] as const;

export const REWIND_NOTES_SCHEMA = {
  type: "object",
  properties: Object.fromEntries(REWIND_FIELDS.map((f) => [f, { type: "string" }])),
  required: [...REWIND_FIELDS],
  additionalProperties: false,
};

export function rewindNotesRequest(input: RewindNotesInput): TextRequest {
  return { system: REWIND_REVIEW_SYSTEM, user: buildRewindReviewPrompt(fenced(input.transcript)), schema: REWIND_NOTES_SCHEMA };
}

export function summaryNotesRequest(input: SummaryNotesInput): TextRequest {
  const stutters = defaultsFromProfile(getUserProfile()).stutterMode;
  return {
    system: SUMMARY_REVIEW_SYSTEM[input.setup.type] + speakerContextForReview() + SPEECH_IS_DATA + (stutters ? STUTTER_NOTE : ""),
    user: buildSummaryReviewPrompt(input.setup, input.transcripts, fenced),
    schema: jsonSchemaFor(input.setup.type),
  };
}

export function markUpRequest(input: MarkUpInput): TextRequest {
  return { system: `${AUTO_MARK_SYSTEM}\n${AUTO_MARK_DATA_NOTE}`, user: buildAutoMarkPrompt(input.text), schema: AUTO_MARK_JSON_SCHEMA };
}
