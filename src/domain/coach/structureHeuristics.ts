// Cheap, on-device structure and confidence signals from transcript text.
// The Apple on-device model (Phase 2B) does this better; these heuristics
// are the always-available fallback and also feed the rule-based coach.

export type FrameworkId =
  | "PREP"
  | "WhatSoWhatNowWhat"
  | "ProblemSolutionBenefit"
  | "PastPresentFuture"
  | "StoryArc"
  | "STAR"
  | "ListOfThree"
  | "None";

export const FRAMEWORK_LABELS: Record<FrameworkId, string> = {
  PREP: "Point–Reason–Example–Point",
  WhatSoWhatNowWhat: "What – So what – Now what",
  ProblemSolutionBenefit: "Problem – Solution – Benefit",
  PastPresentFuture: "Past – Present – Future",
  StoryArc: "Story arc",
  STAR: "Situation – Task – Action – Result",
  ListOfThree: "List of three",
  None: "No clear structure",
};

// The prompt categories each structure fits, so a structure rep gets a
// prompt it can actually answer — PREP needs a question to take a side on,
// STAR needs a "tell me about a time". Categories are the prompt library's
// (data/topics.ts).
export const FRAMEWORK_PROMPT_CATEGORIES: Record<Exclude<FrameworkId, "None">, string[]> = {
  PREP: ["Opinion", "Hypothetical", "Persuade", "Debate"],
  WhatSoWhatNowWhat: ["Explain"],
  ProblemSolutionBenefit: ["Opinion", "Hypothetical", "Persuade"],
  PastPresentFuture: ["Personal", "One word"],
  StoryArc: ["Story", "Creative"],
  STAR: ["Story"],
  ListOfThree: ["Opinion", "Hypothetical", "Debate", "One word"],
};

const CUES: Record<Exclude<FrameworkId, "None">, RegExp[]> = {
  PREP: [/\bbecause\b|\bthe reason\b/, /\bfor example\b|\bfor instance\b|\bone time\b/, /\bso\b.*\b(that's why|in short|which is why|bottom line)\b|\bthat's why\b|\bin short\b/],
  WhatSoWhatNowWhat: [/\bwhat (happened|it is)\b|\bhere's what\b/, /\bso what\b|\bwhy (it|this) matters\b|\bthis matters\b/, /\bnow what\b|\bnext step\b|\bgoing forward\b|\bwhat (i|we) (should|need to|will) do\b/],
  ProblemSolutionBenefit: [/\bproblem\b|\bchallenge\b|\bissue\b/, /\bsolution\b|\bfix\b|\binstead\b/, /\bbenefit\b|\bresult\b|\bwhich means\b|\bso that\b/],
  PastPresentFuture: [/\bused to\b|\bback then\b|\bin the past\b|\byears ago\b/, /\bnow\b|\btoday\b|\bthese days\b|\bcurrently\b/, /\bin the future\b|\bgoing forward\b|\bnext year\b|\bwill\b/],
  StoryArc: [/\bone (time|day)\b|\bi remember\b|\bonce\b/, /\bthen\b|\bsuddenly\b|\bbut\b/, /\bin the end\b|\beventually\b|\bfinally\b|\bi learned\b/],
  STAR: [
    /\bi was (working|asked|responsible|in charge)\b|\bmy (job|role|task) was\b|\bwe (had|needed) to\b|\bthe (situation|goal|task) was\b|\bat my (last|old|first) job\b/,
    /\bso i\b|\bi decided\b|\bwhat i did\b|\bi (started|took|set up|reached out|talked to|built|organized|suggested|asked)\b/,
    /\bas a result\b|\bthe result\b|\bin the end\b|\bwe ended up\b|\bwhich meant\b|\bi learned\b/,
  ],
  ListOfThree: [/\bfirst(ly)?\b|\bone\b/, /\bsecond(ly)?\b|\bnext\b|\btwo\b/, /\bthird(ly)?\b|\bfinally\b|\blast(ly)?\b|\bthree\b/],
};

export interface StructureGuess {
  framework: FrameworkId;
  // How many of the framework's beats were found (0-3).
  beatsFound: number;
  // Whether the opening sentence states a point (short, declarative).
  pointUpFront: boolean;
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// `target` is the structure a rep was practicing: on a tie it wins, so an
// answer that hits every PREP beat isn't marked wrong for also happening to
// say "first… second… finally".
export function guessStructure(transcript: string, target?: FrameworkId | null): StructureGuess {
  const lower = transcript.toLowerCase();
  let best: { id: FrameworkId; beats: number } = { id: "None", beats: 0 };
  for (const [id, beats] of Object.entries(CUES) as [Exclude<FrameworkId, "None">, RegExp[]][]) {
    // Beats must appear in order: each cue searched after the previous hit.
    let from = 0;
    let found = 0;
    for (const re of beats) {
      const m = re.exec(lower.slice(from));
      if (!m) continue;
      found += 1;
      from += m.index + m[0].length;
    }
    if (found > best.beats || (found === best.beats && found > 0 && id === target)) best = { id, beats: found };
  }
  const first = sentences(transcript)[0] ?? "";
  const firstWords = first.split(/\s+/).filter(Boolean).length;
  return {
    framework: best.beats >= 2 ? best.id : "None",
    beatsFound: best.beats,
    pointUpFront: firstWords > 3 && firstWords <= 25 && !/\?$/.test(first),
  };
}

// Phrases that undercut authority. "I think" is fine once; repeated, it
// reads as uncertainty.
const HEDGES = [
  "kind of",
  "sort of",
  "i guess",
  "i suppose",
  "maybe",
  "probably",
  "a little bit",
  "i'm not sure",
  "i don't know",
  "i think",
  "just",
];

export function findHedges(transcript: string): string[] {
  const lower = ` ${transcript.toLowerCase().replace(/[^a-z' ]/g, " ")} `;
  const found: string[] = [];
  for (const hedge of HEDGES) {
    const re = new RegExp(`\\b${hedge.replace(/'/g, "'")}\\b`, "g");
    const count = (lower.match(re) ?? []).length;
    for (let i = 0; i < count; i++) found.push(hedge);
  }
  return found;
}

const WEAK_ENDINGS = /\b(so yeah|yeah so|that's it|that's about it|i guess that's it|anyway|um|uh|or something|and stuff|you know)[.!?]*$/i;

// A strong close lands on a statement, not a trail-off.
export function hasStrongEnding(transcript: string): boolean {
  const last = sentences(transcript).pop() ?? "";
  if (!last) return false;
  return !WEAK_ENDINGS.test(last.trim());
}
