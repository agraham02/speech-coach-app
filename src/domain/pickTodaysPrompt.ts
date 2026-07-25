import type { Prompt } from "./sessionTypes";
import { todayISODate } from "../utils/dateUtils";

// How many of the most recently recorded prompts to avoid repeating.
export const AVOID_REPEAT_LAST_N = 20;

// Deterministic by date (via a simple string hash) so reopening the app on the
// same day always shows the same prompt, without needing to persist a choice.
export function hashStringToInt(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// Excludes recently-used prompt ids (e.g. the last N recorded sessions) from
// the candidate pool before picking, so the same prompt doesn't come back
// around too soon. Falls back to the full list if every prompt has been
// excluded (topic bank smaller than, or fully consumed by, the exclusion window).
export function pickTodaysPrompt(
  topics: Prompt[],
  excludePromptIds: string[] = [],
  isoDate: string = todayISODate(),
): Prompt {
  if (topics.length === 0) {
    throw new Error("Topic list is empty");
  }

  const excludeSet = new Set(excludePromptIds);
  const candidates = topics.filter((t) => !excludeSet.has(t.id));
  const pool = candidates.length > 0 ? candidates : topics;

  const index = hashStringToInt(isoDate) % pool.length;
  return pool[index];
}
