import type { SkillId } from "../../theme/tokens";
import type { CoachOutput } from "./ruleCoach";
import type { Provenance } from "../analysis/types";

// The coach's read on a take (strength, tip, focus skill, follow-up question)
// written by the Tono AI video review in the same call as the review, so there
// is no second request and the coaching no longer depends on which iPhone you
// own. Pure: the model's answer is validated here, then laid over the rule
// coach, which keeps everything it measured (structure, hedges, ending,
// observations).

export const SKILL_IDS: readonly SkillId[] = ["articulation", "cadence", "impromptu", "confidence", "conversation"];

const MAX_STRENGTH = 300;
const MAX_TIP = 500;
const MAX_QUESTION = 200;

export interface CloudCoaching {
  strength: string;
  tip: string;
  // Null when the model named a skill the app doesn't have: the rules' pick stands.
  focusSkill: SkillId | null;
  followUpQuestion: string | null;
  // Who wrote it: the review's provenance (model, prompt, what it was sent).
  provenance?: Provenance;
}

const clean = (value: unknown): string => (typeof value === "string" ? value.trim().replace(/^["'“”]|["'“”]$/g, "").trim() : "");

// The review's `quick_coach` object, or null when it isn't usable. A missing or
// malformed one never fails the review itself; the phone's coaching stays.
export function acceptQuickCoach(value: unknown, provenance?: Provenance): CloudCoaching | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const strength = clean(raw.strength);
  const tip = clean(raw.tip);
  if (!strength || !tip || strength.length > MAX_STRENGTH || tip.length > MAX_TIP) return null;
  const skill = clean(raw.focus_skill).toLowerCase();
  const question = clean(raw.follow_up_question);
  return {
    strength,
    tip,
    focusSkill: (SKILL_IDS as readonly string[]).includes(skill) ? (skill as SkillId) : null,
    followUpQuestion: question && question.length <= MAX_QUESTION ? question : null,
    ...(provenance ? { provenance } : {}),
  };
}

export function mergeCloudCoach(rules: CoachOutput, cloud: CloudCoaching): CoachOutput {
  return {
    ...rules,
    provenance: cloud.provenance ?? { producer: "tono_ai", provider: "Tono AI", promptVersion: "unknown", judged: true, at: new Date().toISOString() },
    strength: cloud.strength,
    tip: cloud.tip,
    focusSkill: cloud.focusSkill ?? rules.focusSkill,
    followUpQuestion: cloud.followUpQuestion ?? rules.followUpQuestion,
  };
}
