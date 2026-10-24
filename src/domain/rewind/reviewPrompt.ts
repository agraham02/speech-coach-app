import { z } from "zod";
import { quoteIn, snapToSource, wordsOf } from "../analysis/quotes";
import { dayCoverage, type DayPart } from "./stats";

// The notes on a Rewind take, written from the transcript alone: what was
// said, not how it sounded. The judge never gives a score. The prompt itself
// lives on the server (supabase/functions/_shared/prompts/exercises.ts);
// this file is the shape of the answer and the checks the phone makes on it
// before showing a word of it (docs/decisions/exercise-judging.md). Pure.

export type PartStatus = "covered" | "brief" | "missing";

export interface PartCoverage {
  status: PartStatus;
  // A word-for-word quote from the transcript. "" for a missing part.
  evidence: string;
}

export interface RewindReview {
  // Which parts of the day came up, each backed by a quote the phone checked.
  parts: Record<DayPart, PartCoverage>;
  specificity: string;
  storytelling: string;
  flow: string;
  // Worded by the phone from `parts`, so it can never disagree with them.
  coverage: string;
  // A real moment, word for word from the transcript. Left out when the judge
  // gave one that isn't (or isn't a moment).
  vividDetail?: string;
  tryTomorrow: string;
}

const part = z.object({
  status: z.enum(["covered", "brief", "missing"]),
  evidence: z.string(),
});

// What the judge returns.
export const rewindModelSchema = z.object({
  parts: z.object({ morning: part, midday: part, evening: part }),
  specificity: z.string(),
  storytelling: z.string(),
  flow: z.string(),
  vividDetail: z.string(),
  tryTomorrow: z.string(),
});

export type RewindModelOutput = z.infer<typeof rewindModelSchema>;

export const DAY_PARTS: DayPart[] = ["morning", "midday", "evening"];

// "All three parts of your day came up..." and what didn't, in words the
// phone writes from the checked statuses.
export function coverageSentence(parts: Record<DayPart, PartCoverage>): string {
  const of = (s: PartStatus) => DAY_PARTS.filter((p) => parts[p].status === s);
  const list = (items: DayPart[]) => (items.length === 1 ? items[0] : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
  const covered = of("covered");
  const brief = of("brief");
  const missing = of("missing");
  if (covered.length === 3) return "All three parts of your day came up with real detail: the morning, midday and evening.";
  const bits: string[] = [];
  if (covered.length) bits.push(`You told the ${list(covered)} ${covered.length === 1 ? "part" : "parts"} with real detail.`);
  if (brief.length) bits.push(`The ${list(brief)} only came up in passing.`);
  if (missing.length) bits.push(`The ${list(missing)} didn't come up.`);
  return bits.join(" ");
}

const SCORE_LIKE = /\b\d+\s*(\/|out of)\s*\d+\b|\b\d+\s*%|\bscor(?:e|es|ed|ing)\b|\bgrad(?:e|es|ed|ing)\b/i;

const PART_WORDS: Record<DayPart, RegExp> = {
  morning: /\bmornings?\b/,
  midday: /\b(midday|mid-day|afternoons?|lunch(?:time)?|noon|middle of the day)\b/,
  evening: /\b(evenings?|nights?|tonight|bedtime)\b/,
};

// Phrases that say something was absent or thin.
const ABSENCE =
  /\b(?:didn'?t|did not|never|barely|rarely|hardly)\s+(?:\w+\s+){0,3}?(?:cover|mention|talk|say|include|describe|get to|touch|tell)|\b(?:no|little|nothing)\s+(?:\w+\s+){0,3}?(?:about|on|from|for)\b|\b(?:missing|skipped|left out|absent|lacked|lacks)\b/;
const ONLY = /\bonly\s+(?:\w+\s+){0,2}?(?:covered|mentioned|talked about|described|focused on|included|told|got to)\b/;

// Sentences in the notes that deny a part the checked statuses say was
// covered ("you only covered the morning" on a day told from morning to
// night). The mistake this whole file exists to catch.
export function contradictions(notes: string[], parts: Record<DayPart, PartCoverage>): string[] {
  const problems: string[] = [];
  const coveredCount = DAY_PARTS.filter((p) => parts[p].status === "covered").length;
  for (const note of notes) {
    for (const raw of note.split(/[.!?]+\s+/)) {
      const sentence = raw.toLowerCase();
      const mentioned = DAY_PARTS.filter((p) => PART_WORDS[p].test(sentence));
      if (!mentioned.length) continue;
      const quoted = `"${raw.trim().slice(0, 90)}"`;
      if (ABSENCE.test(sentence)) {
        for (const p of mentioned) {
          if (parts[p].status === "covered") problems.push(`A note says the ${p} was missing or thin (${quoted}), but your own coverage says it was covered. Notes must not contradict the coverage.`);
        }
      }
      if (ONLY.test(sentence) && coveredCount >= 2) {
        problems.push(`A note says only some of the day was covered (${quoted}), but your own coverage says ${coveredCount} parts were covered. Notes must not contradict the coverage.`);
      }
    }
  }
  return problems;
}

const MIN_VIVID_WORDS = 5;
const MAX_VIVID_WORDS = 40;

// A moment, not a time stamp or a stray fragment.
function isMoment(text: string): boolean {
  const n = wordsOf(text).length;
  return n >= MIN_VIVID_WORDS && n <= MAX_VIVID_WORDS;
}

export type RewindCheck = { ok: true; review: RewindReview } | { ok: false; problems: string[] };

// The judge's answer, checked against the transcript:
//  - the shape is right, every note says something, and none is a score;
//  - every part it calls covered or brief comes with a quote that is in the
//    transcript word for word (a near-miss is snapped to the transcript's own
//    words);
//  - no note contradicts the statuses;
//  - a part it calls missing isn't one the phone's own keywords plainly find
//    (asked again once; on the last try the judge is trusted, since the
//    phone's keywords are the weaker of the two);
//  - the "most vivid" line is the transcript's own words and a real moment
//    (on the last try a bad one is dropped rather than shown).
// Anything else comes back as problems, which the provider sends to the judge
// for one more go; if it still fails the notes aren't shown at all.
export function checkRewindReview(raw: unknown, transcript: string, opts: { final: boolean } = { final: false }): RewindCheck {
  const parsed = rewindModelSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, problems: ["The answer didn't match the format: parts, specificity, storytelling, flow, vividDetail, tryTomorrow."] };
  const m = parsed.data;
  const problems: string[] = [];

  for (const key of ["specificity", "storytelling", "flow", "tryTomorrow"] as const) {
    const text = m[key].trim();
    if (text.length < 4) problems.push(`${key} is empty.`);
    else if (SCORE_LIKE.test(text)) problems.push(`${key} reads like a score or grade. No scores, percentages or grades.`);
  }

  const parts = {} as Record<DayPart, PartCoverage>;
  const keywords = dayCoverage(transcript);
  for (const p of DAY_PARTS) {
    const { status } = m.parts[p];
    const claimed = m.parts[p].evidence.trim();
    if (status === "missing") {
      parts[p] = { status, evidence: "" };
      if (keywords[p] && !opts.final) {
        problems.push(`You marked the ${p} as missing, but the transcript has words that usually belong to it. Look again; if something in it happened in the ${p}, quote it and mark it covered or brief.`);
      }
      continue;
    }
    if (quoteIn(claimed, transcript) && wordsOf(claimed).length >= 2) {
      parts[p] = { status, evidence: claimed };
      continue;
    }
    const snapped = claimed ? snapToSource(claimed, transcript) : null;
    if (snapped) parts[p] = { status, evidence: snapped };
    else {
      parts[p] = { status, evidence: "" };
      problems.push(`The ${p} evidence ("${claimed.slice(0, 60)}") isn't a word-for-word quote from the transcript. Copy a short run of words exactly.`);
    }
  }

  problems.push(...contradictions([m.specificity, m.storytelling, m.flow, m.tryTomorrow], parts));

  let vivid: string | undefined;
  const claimedVivid = m.vividDetail.trim();
  if (quoteIn(claimedVivid, transcript) && isMoment(claimedVivid)) vivid = claimedVivid;
  else {
    const snapped = claimedVivid ? snapToSource(claimedVivid, transcript) : null;
    if (snapped && isMoment(snapped)) vivid = snapped;
    else if (!opts.final) problems.push(`vividDetail ("${claimedVivid.slice(0, 60)}") must be one moment of ${MIN_VIVID_WORDS} to ${MAX_VIVID_WORDS} words copied exactly from the transcript.`);
  }

  if (problems.length) return { ok: false, problems };

  return {
    ok: true,
    review: {
      parts,
      specificity: m.specificity.trim(),
      storytelling: m.storytelling.trim(),
      flow: m.flow.trim(),
      coverage: coverageSentence(parts),
      ...(vivid ? { vividDetail: vivid } : {}),
      tryTomorrow: m.tryTomorrow.trim(),
    },
  };
}
