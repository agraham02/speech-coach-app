import { getDatabase } from "./database";
import { generateId } from "../../utils/generateId";
import { todayISODate } from "../../utils/dateUtils";

// Three things: what you like about yourself. One to three a day, never the
// same thing twice. Private — it never leaves the phone.

export interface SelfLike {
  id: string;
  date: string; // local YYYY-MM-DD it was written
  text: string;
  promptId: string | null;
  round: number;
  saidAt: string | null;
  createdAt: string;
}

interface Row {
  id: string;
  date: string;
  text: string;
  prompt_id: string | null;
  round: number;
  said_at: string | null;
  created_at: string;
}

function fromRow(r: Row): SelfLike {
  return { id: r.id, date: r.date, text: r.text, promptId: r.prompt_id, round: r.round, saidAt: r.said_at, createdAt: r.created_at };
}

// Everything you've written, oldest first (so the capstone reads as a story).
export async function listSelfLikes(): Promise<SelfLike[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Row>(`SELECT * FROM self_likes WHERE deleted_at IS NULL ORDER BY created_at ASC`);
  return rows.map(fromRow);
}

export async function addSelfLike(input: { text: string; promptId?: string | null; round: number }): Promise<SelfLike> {
  const db = await getDatabase();
  const like: SelfLike = {
    id: generateId(),
    date: todayISODate(),
    text: input.text.trim(),
    promptId: input.promptId ?? null,
    round: input.round,
    saidAt: null,
    createdAt: new Date().toISOString(),
  };
  await db.runAsync(`INSERT INTO self_likes (id, date, text, prompt_id, round, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [
    like.id,
    like.date,
    like.text,
    like.promptId,
    like.round,
    like.createdAt,
  ]);
  return like;
}

export async function markSelfLikeSaid(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE self_likes SET said_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
}

export async function deleteSelfLike(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE self_likes SET deleted_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
}

// Undo for deleteSelfLike.
export async function restoreSelfLike(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE self_likes SET deleted_at = NULL WHERE id = ?`, [id]);
}
