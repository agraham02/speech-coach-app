import { getDatabase } from "./database";
import { rowToPrompt, type PromptRow } from "./mappers";
import { FREE_RECORD_PROMPT, TOPICS } from "../../data/topics";
import { generateId } from "../../utils/generateId";
import { DIFFICULTY_OVERRIDES, defaultDifficultyTier } from "../../domain/promptDifficulty";
import type { DifficultyTier, Prompt } from "../../domain/sessionTypes";
import { logger } from "../../utils/logger";

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

// Keeps the built-in bank in step with data/topics.ts, on every launch.
// Migration v8 only seeded it once, so without this a topic added, edited or
// removed in an update (including an over-the-air one) never reached an
// existing install. Removed topics are soft-deleted, so old sessions still
// resolve their prompt. Prompts people wrote themselves are never touched.
export async function syncBuiltInTopics(): Promise<void> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: string; category: string; text: string; difficulty_tier: string; deleted_at: string | null }>(
    "SELECT id, category, text, difficulty_tier, deleted_at FROM prompts WHERE is_user_created = 0",
  );
  const have = new Map(rows.map((r) => [r.id, r]));
  const wanted = new Set(TOPICS.map((t) => t.id));
  const changed = TOPICS.map((t) => ({ ...t, tier: DIFFICULTY_OVERRIDES[t.id] ?? defaultDifficultyTier(t.category, t.text) })).filter((t) => {
    const r = have.get(t.id);
    return !r || r.text !== t.text || r.category !== t.category || r.difficulty_tier !== t.tier || r.deleted_at != null;
  });
  const removed = rows.filter((r) => !wanted.has(r.id) && r.deleted_at == null);
  if (!changed.length && !removed.length) return;
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (const t of changed) {
      await db.runAsync(
        `INSERT INTO prompts (id, category, text, difficulty_tier, is_user_created, created_at, deleted_at)
         VALUES (?, ?, ?, ?, 0, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET category = excluded.category, text = excluded.text, difficulty_tier = excluded.difficulty_tier, deleted_at = NULL
         WHERE prompts.is_user_created = 0`,
        [t.id, t.category, t.text, t.tier, now],
      );
    }
    for (const r of removed) await db.runAsync("UPDATE prompts SET deleted_at = ? WHERE id = ? AND is_user_created = 0", [now, r.id]);
  });
  logger.info(`[prompts] built-in bank synced: ${changed.length} added or changed, ${removed.length} removed`);
}
