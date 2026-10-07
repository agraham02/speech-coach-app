import { z } from "zod";
import type { CoachInput, CoachOutput } from "./ruleCoach";
import { FRAMEWORK_LABELS, type FrameworkId } from "./structureHeuristics";

// Prompt + schema for the Apple on-device model (~3B params, 4,096-token
// context shared by instructions, input and output). The model only writes
// words; every number shown to the user comes from on-device measurement.

export const MAX_TRANSCRIPT_WORDS = 900;

const FRAMEWORK_IDS = Object.keys(FRAMEWORK_LABELS) as [FrameworkId, ...FrameworkId[]];

export const appleCoachSchema = z.object({
  structureDetected: z.enum(FRAMEWORK_IDS),
  mainPoint: z.string().describe("The speaker's main point in one short sentence, or empty if unclear."),
  strength: z.string().describe("One specific thing done well, under 20 words."),
  tip: z.string().describe("The single most useful change for next time, concrete and under 35 words."),
  followUpQuestion: z.string().describe("A natural follow-up question a listener would ask, under 18 words."),
});

export type AppleCoachResult = z.infer<typeof appleCoachSchema>;

export function trimTranscript(text: string, maxWords = MAX_TRANSCRIPT_WORDS): string {
  const words = text.split(/\s+/).filter(Boolean);
  return words.length <= maxWords ? words.join(" ") : `${words.slice(0, maxWords).join(" ")} …`;
}

export const APPLE_COACH_SYSTEM =
  "You are a warm, direct public-speaking coach. You get a transcript of a short practice answer plus measurements taken on the phone. " +
  "Reply only with the requested fields. Be specific to what was said; quote at most a few words. Never invent numbers — refer to the measurements given.";

export function buildAppleCoachPrompt(input: CoachInput, rules: CoachOutput): string {
  const facts = rules.observations.map((o) => `- ${o.label}: ${o.value} (${o.verdict})`).join("\n");
  const target =
    input.targetFramework && input.targetFramework !== "None"
      ? `The speaker was practicing the "${FRAMEWORK_LABELS[input.targetFramework]}" structure.\n`
      : "";
  return [
    input.promptText ? `Prompt they answered: "${input.promptText}"` : "This was a free-form recording.",
    target,
    `Measurements:\n${facts || "- none available"}`,
    `The measurement-based tip is: "${rules.tip}". Prefer it unless the transcript shows a more important issue.`,
    `Transcript:\n"""${trimTranscript(input.transcript ?? "")}"""`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

// Model wording on top of the rule-based measurements.
export function mergeAppleCoach(rules: CoachOutput, model: AppleCoachResult): CoachOutput {
  const clean = (s: string) => s.trim().replace(/^["']|["']$/g, "");
  return {
    ...rules,
    source: "apple",
    strength: clean(model.strength) || rules.strength,
    tip: clean(model.tip) || rules.tip,
    followUpQuestion: clean(model.followUpQuestion) || rules.followUpQuestion,
    structure: { ...rules.structure, framework: model.structureDetected },
  };
}
