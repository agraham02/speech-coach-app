import { z } from "zod";
import type { TakeKind } from "../scoring/takeLeaves";
import type { LeafId } from "../scoring/skillTree";
import type { GeminiQuoteAnnotation } from "../transcriptAnnotations";

// Tono AI's judgement of a take: a level from 0 to 5 on each Message leaf it owns,
// with a quote (docs/overhaul/PLAN.md, sections 6.4 and 6.6). The server writes the
// prompt and the schema (supabase/functions/_shared/prompts/takeReview.ts); the
// phone checks every answer here before anything is stored or scored. A level whose
// quote isn't in the transcript doesn't count: the judge can't score what it can't
// show. Pure.

// The answer format this app reads. The server refuses to answer in another.
export const TAKE_REVIEW_SCHEMA_VERSION = 4;

export type StructureUsed = "what/why/how" | "story arc" | "none detected" | "other";

// The leaves a judge owns. A jest test keeps these in step with the server's.
export const JUDGED_LEAF_IDS = ["answers_question", "point_first", "has_shape", "hits_beats", "ideas_connect", "specifics"] as const satisfies readonly LeafId[];
export type JudgedLeafId = (typeof JUDGED_LEAF_IDS)[number];

export interface JudgedLeafLevel {
  level: number; // 0-5
  quote: string;
  notes: string;
}

export interface JudgedReview {
  leaves: Partial<Record<JudgedLeafId, JudgedLeafLevel>>;
  // Set when the judge says this can't be scored as an answer: why, kindly.
  notScorable: string | null;
  structureUsed: StructureUsed | null;
  transcriptClean: string;
  // Only when the judge had no phone transcript and wrote one from the audio.
  transcriptVerbatim: string | null;
  // Located in the transcript by quote; ones that aren't in it are dropped.
  annotations: GeminiQuoteAnnotation[];
  coaching: { summary: string; strength: string; focus: string; drill: string };
  // The coach card from the same call, checked later (domain/coach/cloudCoach.ts).
  quickCoach: unknown | null;
}

const leafSchema = z.object({ level: z.number(), quote: z.string().optional().default(""), notes: z.string() });

const answerSchema = z.object({
  transcript_verbatim: z.string().optional(),
  transcript_clean: z.string(),
  structure_used: z.enum(["what/why/how", "story arc", "none detected", "other"]).optional(),
  scorable: z.boolean().optional(),
  not_scorable_reason: z.string().optional(),
  leaves: z.record(z.string(), z.unknown()).optional().default({}),
  annotations: z.array(z.object({ quote: z.string(), subcategory: z.string(), note: z.string() })).default([]),
  coaching: z.object({ summary: z.string(), strength: z.string(), focus: z.string(), drill: z.string() }),
  quick_coach: z.unknown().optional(),
});

// Where an annotation shows on the transcript (its colour and label).
const DISPLAY: Record<JudgedLeafId, GeminiQuoteAnnotation["category"]> = {
  answers_question: "content",
  point_first: "content",
  has_shape: "structure",
  hits_beats: "structure",
  ideas_connect: "content",
  specifics: "content",
};

export function annotationCategoryFor(subcategory: string): GeminiQuoteAnnotation["category"] | null {
  if (subcategory === "restated_point") return "restated_point";
  return DISPLAY[subcategory as JudgedLeafId] ?? null;
}

const clampLevel = (n: number) => Math.min(5, Math.max(0, Math.round(n)));

// Case, punctuation and spacing don't change what was said.
const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();

// Too few levels that hold up, and it doesn't count as a judgement.
const MIN_LEAVES = 3;

// The answer, checked: only the leaves a judge owns are kept, levels are held to
// 0-5, a level needs a quote that's really in the transcript (none at level 0, with
// nothing to show), and so does every annotation. Null when too little survives to
// count as a judgement. A script is coached, not scored, so it needs no leaves.
export function acceptJudgedReview(raw: unknown, take: { kind: TakeKind; transcript: string | null }): JudgedReview | null {
  const parsed = answerSchema.safeParse(raw);
  if (!parsed.success) return null;
  const a = parsed.data;

  const verbatim = a.transcript_verbatim?.trim() ? a.transcript_verbatim : null;
  const said = normalize(take.transcript ?? verbatim ?? "");
  const found = (quote: string) => {
    const q = normalize(quote);
    return !!q && said.includes(q);
  };

  const notScorable = take.kind === "impromptu" && a.scorable === false ? a.not_scorable_reason?.trim() || "Tono AI couldn't score this as an answer." : null;

  const leaves: JudgedReview["leaves"] = {};
  if (take.kind === "impromptu" && !notScorable) {
    for (const id of JUDGED_LEAF_IDS) {
      const value = leafSchema.safeParse(a.leaves[id]);
      if (!value.success || !Number.isFinite(value.data.level) || !value.data.notes.trim()) continue;
      const level = clampLevel(value.data.level);
      if (level > 0 && !found(value.data.quote)) continue;
      leaves[id] = { level, quote: value.data.quote.trim(), notes: value.data.notes.trim() };
    }
    if (Object.keys(leaves).length < MIN_LEAVES) return null;
  }

  const annotations: GeminiQuoteAnnotation[] = [];
  for (const note of a.annotations) {
    const category = annotationCategoryFor(note.subcategory);
    const quote = note.quote.trim();
    if (!category || !quote || !note.note.trim() || !found(quote)) continue;
    annotations.push({ quote, category, note: note.note.trim() });
  }

  return {
    leaves,
    notScorable,
    structureUsed: take.kind === "impromptu" ? (a.structure_used ?? null) : null,
    transcriptClean: a.transcript_clean.trim(),
    transcriptVerbatim: take.transcript ? null : verbatim,
    annotations,
    coaching: a.coaching,
    quickCoach: a.quick_coach ?? null,
  };
}
