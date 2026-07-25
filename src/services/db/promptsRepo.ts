import { TOPICS, getPromptById } from "../../data/topics";
import type { Prompt } from "../../domain/sessionTypes";

// Prompts are a static curated list (no AI, no DB table) per Phase 1 scope.
export function getAllPrompts(): Prompt[] {
  return TOPICS;
}

export function getPrompt(id: string): Prompt | undefined {
  return getPromptById(id);
}
