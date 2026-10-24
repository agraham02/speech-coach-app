import type { z } from "zod";
import type { CountKind, ModelRole } from "../types.ts";
import {
  buildMarkUp,
  buildRewindNotes,
  buildSummaryNotes,
  MARK_UP_SCHEMA_VERSION,
  markUpInputsSchema,
  REWIND_NOTES_SCHEMA_VERSION,
  rewindNotesInputsSchema,
  SUMMARY_NOTES_SCHEMA_VERSION,
  summaryNotesInputsSchema,
} from "./exercises.ts";
import { buildTakeReview, TAKE_REVIEW_SCHEMA_VERSION, takeReviewInputsSchema, type BuiltRequest, type JudgeInput } from "./takeReview.ts";

// Every kind of Tono AI call the server runs, in one table: what the phone
// must send, what it counts against, which model role runs it, and how the
// prompt is written. The phone names the task and sends its inputs; the
// prompt and the answer's schema are made here.

export type Task = "take_review" | "rewind_notes" | "summary_notes" | "mark_up";

export interface TaskDef {
  inputs: z.ZodType<unknown>;
  // The answer format the app understands. The phone says which one it
  // expects; anything else is refused rather than answered in a shape the
  // app can't read.
  schemaVersion: number;
  count: CountKind;
  role: (media: boolean) => ModelRole;
  // Whether this task may carry the take's video.
  allowsMedia: boolean;
  build: (inputs: never, input: JudgeInput) => BuiltRequest;
}

export const TASKS: Record<Task, TaskDef> = {
  take_review: {
    inputs: takeReviewInputsSchema,
    schemaVersion: TAKE_REVIEW_SCHEMA_VERSION,
    // One take, one count, whatever the judge was sent.
    count: "take",
    role: (media) => (media ? "review_video" : "text"),
    allowsMedia: true,
    build: buildTakeReview as TaskDef["build"],
  },
  rewind_notes: {
    inputs: rewindNotesInputsSchema,
    schemaVersion: REWIND_NOTES_SCHEMA_VERSION,
    count: "text",
    role: () => "text",
    allowsMedia: false,
    build: buildRewindNotes as TaskDef["build"],
  },
  summary_notes: {
    inputs: summaryNotesInputsSchema,
    schemaVersion: SUMMARY_NOTES_SCHEMA_VERSION,
    count: "text",
    role: () => "text",
    allowsMedia: false,
    build: buildSummaryNotes as TaskDef["build"],
  },
  mark_up: {
    inputs: markUpInputsSchema,
    schemaVersion: MARK_UP_SCHEMA_VERSION,
    count: "text",
    role: () => "text",
    allowsMedia: false,
    build: buildMarkUp as TaskDef["build"],
  },
};

export const TASK_NAMES = Object.keys(TASKS) as Task[];

export type { BuiltRequest, JudgeInput } from "./takeReview.ts";
