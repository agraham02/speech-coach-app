import { FREE_RECORD_PROMPT, TOPICS, getPromptById } from "../../data/topics";
import type { Prompt } from "../../domain/sessionTypes";

// Prompts are a static curated list (no AI, no DB table) per Phase 1 scope.
export function getAllPrompts(): Prompt[] {
  return TOPICS;
}

export function getPrompt(id: string): Prompt | undefined {
  if (id === FREE_RECORD_PROMPT.id) return FREE_RECORD_PROMPT;
  return getPromptById(id);
}
