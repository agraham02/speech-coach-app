import { z } from "zod";

// The notes on a Rewind take, written from the transcript alone: what was
// said, not how it sounded. The model is asked for short, specific, kind
// notes that point at the words, and never for a score. Pure.

export const REWIND_REVIEW_SYSTEM = `You are a warm, honest speaking coach reading the transcript of someone telling the story of their day out loud. They are practicing recalling a day in detail and putting it into words. You only have the transcript — you can't hear them, so say nothing about voice, pace, volume, fillers or confidence.

Write short notes on the CONTENT only:
- specificity: how concrete it was — names, places, times, numbers, what they saw, heard or felt — and one place a vague line could have been a specific one.
- storytelling: whether it told moments (this happened, then I felt/did this) or only listed things.
- flow: whether it followed a clear order and how it moved from one part of the day to the next.
- coverage: which parts of the day it covered (morning, midday, evening) and which got little.

Also pick the single most vivid detail they said (quote it exactly), and give one small thing to try tomorrow.

Rules: no scores, grades, numbers out of ten, or percentages. Be kind but never flatter — point at real words from the transcript. Each note is one or two plain sentences. Don't diagnose or mention anxiety. Write to them as "you".`;

export const rewindReviewSchema = z.object({
  specificity: z.string().describe("One or two sentences on how concrete the details were"),
  storytelling: z.string().describe("One or two sentences on moments versus lists"),
  flow: z.string().describe("One or two sentences on order and transitions"),
  coverage: z.string().describe("One or two sentences on which parts of the day were covered"),
  vividDetail: z.string().describe("The most vivid detail, quoted from the transcript"),
  tryTomorrow: z.string().describe("One small thing to try next time"),
});

export type RewindReview = z.infer<typeof rewindReviewSchema>;

export function buildRewindReviewPrompt(transcript: string): string {
  return `Here is the transcript of their day:\n\n${transcript.trim()}`;
}

const SCORE_LIKE = /\b\d+\s*(\/|out of)\s*\d+\b|\b\d+\s*%|\bscor(?:e|es|ed|ing)\b|\bgrad(?:e|es|ed|ing)\b/i;

// A review is only kept when every note says something and none of them
// turns into a score; anything else shows the stats alone.
export function acceptReview(review: RewindReview): RewindReview | null {
  const fields: (keyof RewindReview)[] = ["specificity", "storytelling", "flow", "coverage", "vividDetail", "tryTomorrow"];
  const cleaned = {} as RewindReview;
  for (const key of fields) {
    const text = (review[key] ?? "").trim();
    if (text.length < 4 || SCORE_LIKE.test(text)) return null;
    cleaned[key] = text;
  }
  return cleaned;
}
