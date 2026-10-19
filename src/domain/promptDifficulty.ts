import type { DifficultyTier } from "./sessionTypes";

// Category is the primary signal for how hard a prompt is to speak on
// spontaneously: Personal/Story prompts draw on content you already have
// (you just have to narrate it), Opinion/Hypothetical require taking or
// inventing a stance, and Explain/Spontaneous are hardest — either you have
// to get a concept right on the fly, or you get zero framing at all and have
// to invent an angle from a bare noun.
const CATEGORY_BASE_TIER: Record<string, DifficultyTier> = {
  Personal: "easy",
  Story: "easy",
  Opinion: "medium",
  Hypothetical: "medium",
  // Persuade and Creative hand you a premise and an audience; Debate asks
  // for a defended position on something contested.
  Persuade: "medium",
  Creative: "medium",
  Debate: "hard",
  Explain: "hard",
  // One word spans every level — the built-in ones each carry their own
  // tier — so a word you add yourself starts in the middle.
  "One word": "medium",
  // The old name of One word, for prompts people made under it.
  Spontaneous: "hard",
};

const TIER_ORDER: DifficultyTier[] = ["easy", "medium", "hard"];

// Word count is a secondary nudge: a long, multi-clause prompt is harder to
// structure on the fly than a short one in the same category, and a very
// terse non-Spontaneous prompt is under-specified enough to deserve the same
// bump Spontaneous gets by default.
export function defaultDifficultyTier(category: string, text: string): DifficultyTier {
  const base = CATEGORY_BASE_TIER[category] ?? "medium";
  // A bare word is short by design: length says nothing about its difficulty.
  if (category === "One word") return base;
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const bumpHarder = wordCount >= 16 || wordCount <= 5;
  if (!bumpHarder) return base;
  const idx = TIER_ORDER.indexOf(base);
  return TIER_ORDER[Math.min(idx + 1, TIER_ORDER.length - 1)];
}

// Spot-check overrides, keyed by prompt id, for entries where the heuristic
// above mis-tags an individual prompt. Verified by actually running the
// heuristic over all 140 seeded TOPICS (see migrations.ts's v8 seed block)
// rather than guessing: 48 of 140 entries get word-count-bumped, but almost
// all of those bumps are no-ops (Explain/Spontaneous are already "hard" at
// the category level, so bumping them again changes nothing). The only
// entries where the bump actually *changes* the outcome are six long-form
// Hypothetical prompts (medium -> hard). Of those six, most are long only
// because of throat-clearing framing ("If you could/had to...") — the
// underlying question is still a simple preference/reflection, not
// conceptually harder than a short Hypothetical — so pull those back to
// medium. Two (t097, t098) are genuinely more abstract/effortful (inventing
// a talk topic from scratch; reasoning through a multi-step social scenario)
// and correctly stay hard.
export const DIFFICULTY_OVERRIDES: Partial<Record<string, DifficultyTier>> = {
  t092: "medium", // "If you could relive one year of your life exactly as it was, which would you choose?" — just reflection, long phrasing only.
  t094: "medium", // "If you could send one piece of advice back to yourself at 18, what would it be?" — same.
  t099: "medium", // "If you could pause time for everyone but yourself for one day, what would you do?" — same.
  t100: "medium", // "If you had to pick one meal to eat for the rest of your life, what would it be and why?" — a preference question, not hard.
};
