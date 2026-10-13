import { getDatabase } from "./database";
import { generateId } from "../../utils/generateId";
import { PRESET_THOUGHTS } from "../../domain/innerVoice/thoughts";

// Talk back: worries about speaking, and each time you weighed one up. Private
// — it never leaves the phone.

export interface Thought {
  id: string;
  text: string;
  presetId: string | null;
  // "onboarding": from the profile questions (kept in step with them).
  // "added": added here.
  source: "onboarding" | "added";
  createdAt: string;
}

export interface Challenge {
  id: string;
  thoughtId: string;
  beliefBefore: number;
  evidenceFor: string;
  evidenceAgainst: string;
  balanced: string;
  beliefAfter: number | null;
  createdAt: string;
}

interface ThoughtRow {
  id: string;
  text: string;
  preset_id: string | null;
  source: string;
  created_at: string;
}

interface ChallengeRow {
  id: string;
  thought_id: string;
  belief_before: number;
  evidence_for: string | null;
  evidence_against: string | null;
  balanced: string | null;
  belief_after: number | null;
  created_at: string;
}

const thoughtFromRow = (r: ThoughtRow): Thought => ({
  id: r.id,
  text: r.text,
  presetId: r.preset_id,
  source: r.source === "onboarding" ? "onboarding" : "added",
  createdAt: r.created_at,
});

const challengeFromRow = (r: ChallengeRow): Challenge => ({
  id: r.id,
  thoughtId: r.thought_id,
  beliefBefore: r.belief_before,
  evidenceFor: r.evidence_for ?? "",
  evidenceAgainst: r.evidence_against ?? "",
  balanced: r.balanced ?? "",
  beliefAfter: r.belief_after,
  createdAt: r.created_at,
});

export async function listThoughts(): Promise<Thought[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ThoughtRow>(`SELECT * FROM self_talk_thoughts WHERE archived_at IS NULL ORDER BY created_at ASC`);
  return rows.map(thoughtFromRow);
}

export async function getThought(id: string): Promise<Thought | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ThoughtRow>(`SELECT * FROM self_talk_thoughts WHERE id = ?`, [id]);
  return row ? thoughtFromRow(row) : null;
}

export async function addThought(input: { text: string; presetId?: string | null; source?: "onboarding" | "added" }): Promise<Thought | null> {
  const db = await getDatabase();
  const text = input.text.trim();
  if (!text) return null;
  const presetId = input.presetId ?? null;
  // A preset worry is active at most once.
  if (presetId) {
    const existing = await db.getFirstAsync<ThoughtRow>(`SELECT * FROM self_talk_thoughts WHERE preset_id = ? AND archived_at IS NULL`, [presetId]);
    if (existing) return thoughtFromRow(existing);
  } else {
    const same = await db.getFirstAsync<ThoughtRow>(`SELECT * FROM self_talk_thoughts WHERE lower(text) = lower(?) AND archived_at IS NULL`, [text]);
    if (same) return thoughtFromRow(same);
  }
  const thought: Thought = { id: generateId(), text, presetId, source: input.source ?? "added", createdAt: new Date().toISOString() };
  await db.runAsync(`INSERT INTO self_talk_thoughts (id, text, preset_id, source, created_at) VALUES (?, ?, ?, ?, ?)`, [
    thought.id,
    thought.text,
    thought.presetId,
    thought.source,
    thought.createdAt,
  ]);
  return thought;
}

// Hides a worry (its challenges are kept, so a restore brings the history back).
export async function archiveThought(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE self_talk_thoughts SET archived_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
}

export async function restoreThought(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE self_talk_thoughts SET archived_at = NULL WHERE id = ?`, [id]);
}

// Keeps the worries from the profile question in step with the answer: ones
// you picked are added, ones you un-picked (that came from onboarding) are
// hidden. Worries you added in Talk back are never touched.
export async function syncOnboardingThoughts(presetIds: string[], custom: string[]): Promise<void> {
  const db = await getDatabase();
  const wantedText = new Set(custom.map((c) => c.trim().toLowerCase()).filter(Boolean));
  const active = await listThoughts();
  for (const t of active) {
    if (t.source !== "onboarding") continue;
    const stillWanted = t.presetId ? presetIds.includes(t.presetId) : wantedText.has(t.text.toLowerCase());
    if (!stillWanted) await db.runAsync(`UPDATE self_talk_thoughts SET archived_at = ? WHERE id = ?`, [new Date().toISOString(), t.id]);
  }
  for (const id of presetIds) {
    const preset = PRESET_THOUGHTS.find((p) => p.id === id);
    if (preset) await addThought({ text: preset.text, presetId: preset.id, source: "onboarding" });
  }
  for (const text of custom) await addThought({ text, source: "onboarding" });
}

export async function addChallenge(input: {
  thoughtId: string;
  beliefBefore: number;
  evidenceFor: string;
  evidenceAgainst: string;
  balanced: string;
  beliefAfter: number | null;
}): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO self_talk_challenges (id, thought_id, belief_before, evidence_for, evidence_against, balanced, belief_after, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [generateId(), input.thoughtId, input.beliefBefore, input.evidenceFor.trim(), input.evidenceAgainst.trim(), input.balanced.trim(), input.beliefAfter, new Date().toISOString()],
  );
}

// Oldest first, so a thought's belief reads as a trend.
export async function listChallenges(thoughtId: string): Promise<Challenge[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ChallengeRow>(`SELECT * FROM self_talk_challenges WHERE thought_id = ? ORDER BY created_at ASC`, [thoughtId]);
  return rows.map(challengeFromRow);
}

// The latest challenge for each thought, for the list.
export async function latestChallenges(): Promise<Record<string, Challenge>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ChallengeRow>(`SELECT * FROM self_talk_challenges ORDER BY created_at ASC`);
  const latest: Record<string, Challenge> = {};
  for (const r of rows) latest[r.thought_id] = challengeFromRow(r);
  return latest;
}

export async function countThoughts(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM self_talk_thoughts WHERE archived_at IS NULL`);
  return row?.n ?? 0;
}
