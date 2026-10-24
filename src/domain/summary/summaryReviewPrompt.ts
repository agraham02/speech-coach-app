import { z } from "zod";
import { mentions } from "../conversation/text";
import type { SummarySetup } from "./prepareSummary";

// The AI's look at a spoken summary: did it catch the main idea, is it
// accurate, is the wording plain. The model returns verdicts and short notes,
// never a number; the app turns verdicts into the score (evaluateSummary.ts).
// It reads the words only, so it can't comment on voice. Pure.

export const verdict = z.enum(["yes", "partly", "no"]);
export const accuracy = z.enum(["yes", "mostly", "no", "not_checked"]);
export type Verdict = z.infer<typeof verdict>;
export type Accuracy = z.infer<typeof accuracy>;

export const sumUpReviewSchema = z.object({
  core: verdict.describe("Did the summary capture the core of the subject: who or what, what happens, what is at stake?"),
  accurate: accuracy.describe("Are the facts right? not_checked when the subject is the speaker's own"),
  note: z.string().describe("One or two plain sentences on what worked or what was missing"),
  cut: z.string().describe("The one thing to drop to make it tighter, quoted from the transcript, or an empty string"),
  tighter: z.string().describe("A tighter version of their summary within the sentence limit, in their own voice"),
});

export const relayReviewSchema = z.object({
  turns: z
    .array(
      z.object({
        mainIdea: verdict.describe("Did this turn's summary capture the main idea of the paragraph it covers?"),
        linkedBack: z.enum(["yes", "partly", "no", "not_applicable"]).describe("On rolling turns: did it also summarize the previous paragraph in one sentence?"),
        missed: z.string().describe("The key point they missed, or an empty string"),
      }),
    )
    .describe("One entry per turn, in order"),
  note: z.string().describe("One or two plain sentences across the whole exercise"),
  tighter: z.string().describe("One tighter way to say the weakest turn, within its sentence limit"),
});

export const explainReviewSchema = z.object({
  accurate: accuracy.describe("Is the explanation correct?"),
  wrong: z.string().describe("What was wrong or misleading, or an empty string"),
  jargon: z.array(z.string()).describe("Words a ten-year-old would not know, quoted from the transcript"),
  usedExample: z.boolean().describe("Did they give a concrete example or comparison?"),
  note: z.string().describe("One or two plain sentences on what worked"),
  simpler: z.string().describe("A simpler way to say their weakest sentence, in everyday words"),
});

export type SumUpReview = z.infer<typeof sumUpReviewSchema> & { drill: "sum_up" };
export type RelayReview = z.infer<typeof relayReviewSchema> & { drill: "relay" };
export type ExplainReview = z.infer<typeof explainReviewSchema> & { drill: "explain_simple" };
export type SummaryReview = SumUpReview | RelayReview | ExplainReview;

export function schemaFor(type: SummarySetup["type"]) {
  return type === "sum_up" ? sumUpReviewSchema : type === "relay" ? relayReviewSchema : explainReviewSchema;
}

// The prompts and the JSON schema the judge answers in are on the server
// (supabase/functions/_shared/prompts/exercises.ts); these are the checks.

const SCORE_LIKE = /\b\d+\s*(\/|out of)\s*\d+\b|\b\d+\s*%|\bscor(?:e|es|ed|ing)\b|\bgrad(?:e|es|ed|ing)\b/i;

function usableText(text: string | undefined, required: boolean): string | null {
  const t = (text ?? "").trim();
  if (!t) return required ? null : "";
  if (t.length < 4 || SCORE_LIKE.test(t)) return null;
  return t;
}

// A review is kept only when every written note says something and none of
// them turns into a score. Jargon the transcript doesn't contain is dropped.
export function acceptSummaryReview(setup: SummarySetup, raw: unknown, transcripts: string[]): SummaryReview | null {
  const parsed = schemaFor(setup.type).safeParse(raw);
  if (!parsed.success) return null;
  const data = parsed.data as Record<string, unknown>;
  if (setup.type === "sum_up") {
    const d = data as z.infer<typeof sumUpReviewSchema>;
    const note = usableText(d.note, true);
    const tighter = usableText(d.tighter, true);
    const cut = usableText(d.cut, false);
    if (note === null || tighter === null || cut === null) return null;
    const own = !!setup.turns[0]?.own;
    return { drill: "sum_up", ...d, accurate: own ? "not_checked" : d.accurate, note, tighter, cut };
  }
  if (setup.type === "relay") {
    const d = data as z.infer<typeof relayReviewSchema>;
    if (d.turns.length !== setup.turns.length) return null;
    const note = usableText(d.note, true);
    const tighter = usableText(d.tighter, true);
    if (note === null || tighter === null) return null;
    const turns = d.turns.map((t, i) => ({ ...t, linkedBack: setup.turns[i].rolling ? t.linkedBack : ("not_applicable" as const), missed: usableText(t.missed, false) ?? "" }));
    return { drill: "relay", turns, note, tighter };
  }
  const d = data as z.infer<typeof explainReviewSchema>;
  const note = usableText(d.note, true);
  const simpler = usableText(d.simpler, true);
  const wrong = usableText(d.wrong, false);
  if (note === null || simpler === null || wrong === null) return null;
  const spoken = transcripts.join(" ");
  const keep = setup.turns[0]?.keyWords ?? [];
  const jargon = d.jargon.filter((j) => j.trim() && mentions(spoken, j) && !keep.some((k) => mentions(k, j)));
  return { drill: "explain_simple", ...d, note, simpler, wrong, jargon };
}
