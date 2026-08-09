import { getDatabase } from "./database";
import { rowToPrompt, type PromptRow } from "./mappers";
import { FREE_RECORD_PROMPT } from "../../data/topics";
import { generateId } from "../../utils/generateId";
import type { DifficultyTier, Prompt } from "../../domain/sessionTypes";

// Prompts moved from a static in-memory array to a real `prompts` table (see
// migrations.ts's v8 block, seeded from data/topics.ts's TOPICS) so they can
// be browsed, filtered by difficulty, and user-authored (Prompt Library).

export async function getAllPrompts(): Promise<Prompt[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<PromptRow>(
    "SELECT * FROM prompts WHERE deleted_at IS NULL ORDER BY category, id",
  );
  return rows.map(rowToPrompt);
}

// Deliberately does NOT filter deleted_at — History/Result must still be able
// to resolve the text/category of a prompt used by an old session even if
// that (user-created) prompt was later soft-deleted, same pattern as
// sessions' own soft delete.
export async function getPrompt(id: string): Promise<Prompt | undefined> {
  if (id === FREE_RECORD_PROMPT.id) return FREE_RECORD_PROMPT;
  const db = await getDatabase();
  const row = await db.getFirstAsync<PromptRow>("SELECT * FROM prompts WHERE id = ?", [id]);
  return row ? rowToPrompt(row) : undefined;
}

export interface NewUserPrompt {
  category: string;
  text: string;
  difficultyTier: DifficultyTier;
}

export async function insertUserPrompt(input: NewUserPrompt): Promise<Prompt> {
  const db = await getDatabase();
  // "u_" prefix is cosmetic only (helps at a glance in logs/DevScreen) —
  // prompt_id has no FK/CHECK anywhere, so nothing depends on it functionally.
  const id = `u_${generateId()}`;
  const createdAt = new Date().toISOString();
  const category = input.category.trim();
  const text = input.text.trim();
  await db.runAsync(
    `INSERT INTO prompts (id, category, text, difficulty_tier, is_user_created, created_at, deleted_at)
     VALUES (?, ?, ?, ?, 1, ?, NULL)`,
    [id, category, text, input.difficultyTier, createdAt],
  );
  return { id, category, text, difficultyTier: input.difficultyTier };
}
