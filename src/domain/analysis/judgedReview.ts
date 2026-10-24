import { z } from "zod";
import { SUBCATEGORIES, type SubcategoryId, type TakeKind } from "../scoring/taxonomy";
import type { GeminiQuoteAnnotation } from "../transcriptAnnotations";

// Tono AI's judgement of a take, in the scoring taxonomy's own terms: one
// sub-score per subcategory id, each with notes and the evidence it rests on
// (an exact quote or a measured number). The server writes the prompt and the
// schema (supabase/functions/_shared/prompts/takeReview.ts); the phone checks
// every answer here before anything is stored or scored. Pure.

// The answer format this app reads. The server refuses to answer in another.
export const TAKE_REVIEW_SCHEMA_VERSION = 3;

export type StructureUsed = "what/why/how" | "story arc" | "none detected" | "other";

export interface JudgedSubscore {
  score: number;
  notes: string;
  evidence: string;
}

export interface JudgedReview {
  subscores: Partial<Record<SubcategoryId, JudgedSubscore>>;
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

const subscoreSchema = z.object({ score: z.number(), notes: z.string(), evidence: z.string().optional().default("") });

const answerSchema = z.object({
  transcript_verbatim: z.string().optional(),
  transcript_clean: z.string(),
  structure_used: z.enum(["what/why/how", "story arc", "none detected", "other"]).optional(),
  subscores: z.record(z.string(), z.unknown()),
  annotations: z.array(z.object({ quote: z.string(), subcategory: z.string(), note: z.string() })).default([]),
  coaching: z.object({ summary: z.string(), strength: z.string(), focus: z.string(), drill: z.string() }),
  quick_coach: z.unknown().optional(),
});

// Where an annotation shows on the transcript (its colour and label).
const DISPLAY: Partial<Record<SubcategoryId, GeminiQuoteAnnotation["category"]>> = {
  structure: "structure",
  relevance: "content",
  clarity: "content",
  conviction: "content",
  pace: "delivery",
  pauses: "delivery",
  melody: "delivery",
  emphasis: "delivery",
  tone: "delivery",
  cues: "delivery",
  eye_contact: "presence",
  expression: "presence",
  body: "presence",
};

export function annotationCategoryFor(subcategory: string): GeminiQuoteAnnotation["category"] | null {
  if (subcategory === "restated_point") return "restated_point";
  return DISPLAY[subcategory as SubcategoryId] ?? null;
}

const clampScore = (n: number) => Math.min(10, Math.max(1, Math.round(n * 10) / 10));

const MIN_SUBSCORES = 3;

// The answer, checked: only subcategories a judge scores and that apply to
// this kind of take are kept, scores are held to 1-10, and every annotation
// must quote words that are really in the transcript. Null when too little
// survives to count as a judgement.
export function acceptJudgedReview(raw: unknown, take: { kind: TakeKind; transcript: string | null }): JudgedReview | null {
  const parsed = answerSchema.safeParse(raw);
  if (!parsed.success) return null;
  const a = parsed.data;

  const subscores: Partial<Record<SubcategoryId, JudgedSubscore>> = {};
  for (const [id, value] of Object.entries(a.subscores)) {
    const def = SUBCATEGORIES[id as SubcategoryId];
    if (!def || def.judged === null || !def.appliesTo.includes(take.kind)) continue;
    const sub = subscoreSchema.safeParse(value);
    if (!sub.success || !Number.isFinite(sub.data.score) || !sub.data.notes.trim()) continue;
    subscores[id as SubcategoryId] = { score: clampScore(sub.data.score), notes: sub.data.notes.trim(), evidence: sub.data.evidence.trim() };
  }
  if (Object.keys(subscores).length < MIN_SUBSCORES) return null;

  const verbatim = a.transcript_verbatim?.trim() ? a.transcript_verbatim : null;
  const words = (take.transcript ?? verbatim ?? "").toLowerCase();
  const annotations: GeminiQuoteAnnotation[] = [];
  for (const note of a.annotations) {
    const category = annotationCategoryFor(note.subcategory);
    const quote = note.quote.trim();
    if (!category || !quote || !note.note.trim() || !words.includes(quote.toLowerCase())) continue;
    annotations.push({ quote, category, note: note.note.trim() });
  }

  return {
    subscores,
    structureUsed: take.kind === "impromptu" ? (a.structure_used ?? null) : null,
    transcriptClean: a.transcript_clean.trim(),
    transcriptVerbatim: take.transcript ? null : verbatim,
    annotations,
    coaching: a.coaching,
    quickCoach: a.quick_coach ?? null,
  };
}
