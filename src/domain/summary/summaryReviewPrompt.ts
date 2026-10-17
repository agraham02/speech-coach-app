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

// The same shapes in the plain JSON-Schema subset Gemini and the others read.
const VERDICT = { type: "string", enum: ["yes", "partly", "no"] };
const ACCURACY = { type: "string", enum: ["yes", "mostly", "no", "not_checked"] };
const TEXT = { type: "string" };

export function jsonSchemaFor(type: SummarySetup["type"]): object {
  if (type === "sum_up") {
    return { type: "object", properties: { core: VERDICT, accurate: ACCURACY, note: TEXT, cut: TEXT, tighter: TEXT }, required: ["core", "accurate", "note", "cut", "tighter"] };
  }
  if (type === "relay") {
    return {
      type: "object",
      properties: {
        turns: {
          type: "array",
          items: {
            type: "object",
            properties: { mainIdea: VERDICT, linkedBack: { type: "string", enum: ["yes", "partly", "no", "not_applicable"] }, missed: TEXT },
            required: ["mainIdea", "linkedBack", "missed"],
          },
        },
        note: TEXT,
        tighter: TEXT,
      },
      required: ["turns", "note", "tighter"],
    };
  }
  return {
    type: "object",
    properties: { accurate: ACCURACY, wrong: TEXT, jargon: { type: "array", items: TEXT }, usedExample: { type: "boolean" }, note: TEXT, simpler: TEXT },
    required: ["accurate", "wrong", "jargon", "usedExample", "note", "simpler"],
  };
}

export const SUMMARY_REVIEW_SYSTEM: Record<SummarySetup["type"], string> = {
  sum_up: `You are a warm, honest speaking coach. Someone practiced summarizing something in a sentence or two, out loud. You only have the transcript — you can't hear them, so say nothing about voice, pace or fillers.

Judge the CONTENT of the summary:
- core: did it capture who or what it is about, what happens, and what is at stake?
- accurate: are the facts right? Use not_checked when the subject is the speaker's own life or opinion.
- Then give one short note, the one thing to drop, and a tighter version within the sentence limit, written the way they would say it.

Rules: no scores, grades or percentages. Be kind but never flatter — point at real words from the transcript. Write to them as "you". Don't diagnose or mention anxiety.`,
  relay: `You are a warm, honest speaking coach. Someone read a passage one paragraph at a time and, with each paragraph hidden, summarized it out loud: the first two paragraphs in two sentences each, and every later turn as one sentence on the previous paragraph and one sentence on the new one. You only have the transcript — you can't hear them.

For each turn, judge whether the summary captured the main idea of the paragraph it covers (and, on rolling turns, whether it also covered the previous paragraph in one sentence — linkedBack). Name the key point they missed, if any. Then give one short note across the exercise and a tighter way to say the weakest turn.

Rules: no scores, grades or percentages. Be kind but never flatter — point at real words. Write to them as "you". Don't diagnose or mention anxiety.`,
  explain_simple: `You are a warm, honest speaking coach. Someone practiced explaining a concept as if to a ten-year-old, out loud. You only have the transcript — you can't hear them, so say nothing about voice, pace or fillers.

Judge: is the explanation correct (accurate), anything wrong or misleading (wrong), words a ten-year-old would not know (jargon — quote only words that are really in the transcript, and never the subject's own name), and whether they gave a concrete example or comparison. Then one short note and a simpler way to say their weakest sentence.

Rules: no scores, grades or percentages. Be kind but never flatter — point at real words. Write to them as "you". Don't diagnose or mention anxiety.`,
};

// The user message: what they were asked, what a good answer looks like, and
// each transcript. Transcripts go between """ fences so they can't close one;
// `fence` is the shared sanitizer (services/cloud/inputGuards.ts).
export function buildSummaryReviewPrompt(setup: SummarySetup, transcripts: string[], fence: (text: string) => string): string {
  const parts: string[] = [];
  if (setup.type === "sum_up") {
    const t = setup.turns[0];
    parts.push(`THE SUBJECT THEY WERE ASKED TO SUM UP: "${fence(t.show)}"${t.own ? " (their own life or opinion — accuracy can't be checked)" : ""}`);
    parts.push(`SENTENCE LIMIT: ${t.sentenceLimit}`);
    if (t.example) parts.push(`ONE GOOD SUMMARY, FOR REFERENCE ONLY: "${fence(t.example)}"`);
  } else if (setup.type === "relay") {
    setup.turns.forEach((t, i) => {
      parts.push(`TURN ${i + 1}${t.rolling ? " (rolling: one sentence on the previous paragraph, one on this one)" : ""}\nPARAGRAPH THEY READ:\n"""\n${fence(t.show)}\n"""`);
      if (t.rolling && t.prevText) parts.push(`PREVIOUS PARAGRAPH:\n"""\n${fence(t.prevText)}\n"""`);
    });
  } else {
    const t = setup.turns[0];
    parts.push(`THE CONCEPT THEY WERE ASKED TO EXPLAIN SIMPLY: "${fence(t.show)}"`);
    if (t.example) parts.push(`ONE GOOD SIMPLE EXPLANATION, FOR REFERENCE ONLY: "${fence(t.example)}"`);
  }
  transcripts.forEach((text, i) => {
    parts.push(`${setup.turns.length > 1 ? `WHAT THEY SAID IN TURN ${i + 1}` : "WHAT THEY SAID"} (speech recognition):\n"""\n${fence(text.trim() || "(nothing was recognized)")}\n"""`);
  });
  return parts.join("\n\n");
}

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
