import { getDatabase } from "./database";
import { generateId } from "../../utils/generateId";

// The Phrasebook: phrases, sentences and turns of phrase you want to
// remember — things heard or read that you'd like to say yourself. Not a
// journal: short, and only about speech.

export interface SavedPhrase {
  id: string;
  text: string;
  note: string | null;
  createdAt: string;
  practicedCount: number;
  lastPracticedAt: string | null;
}

interface Row {
  id: string;
  text: string;
  note: string | null;
  created_at: string;
  practiced_count: number;
  last_practiced_at: string | null;
}

function fromRow(r: Row): SavedPhrase {
  return {
    id: r.id,
    text: r.text,
    note: r.note,
    createdAt: r.created_at,
    practicedCount: r.practiced_count,
    lastPracticedAt: r.last_practiced_at,
  };
}

export async function listPhrases(): Promise<SavedPhrase[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Row>(`SELECT * FROM saved_phrases WHERE deleted_at IS NULL ORDER BY created_at DESC`);
  return rows.map(fromRow);
}

export async function countPhrases(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM saved_phrases WHERE deleted_at IS NULL`);
  return row?.n ?? 0;
}

export async function getPhrasesByIds(ids: string[]): Promise<SavedPhrase[]> {
  if (!ids.length) return [];
  const db = await getDatabase();
  const rows = await db.getAllAsync<Row>(
    `SELECT * FROM saved_phrases WHERE deleted_at IS NULL AND id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  const byId = new Map(rows.map((r) => [r.id, fromRow(r)]));
  return ids.map((id) => byId.get(id)).filter((p): p is SavedPhrase => !!p);
}

export async function addPhrase(text: string, note?: string): Promise<SavedPhrase> {
  const db = await getDatabase();
  const phrase: SavedPhrase = {
    id: generateId(),
    text: text.trim(),
    note: note?.trim() || null,
    createdAt: new Date().toISOString(),
    practicedCount: 0,
    lastPracticedAt: null,
  };
  await db.runAsync(`INSERT INTO saved_phrases (id, text, note, created_at) VALUES (?, ?, ?, ?)`, [phrase.id, phrase.text, phrase.note, phrase.createdAt]);
  return phrase;
}

export async function deletePhrase(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE saved_phrases SET deleted_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
}

// Undo for deletePhrase.
export async function restorePhrase(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE saved_phrases SET deleted_at = NULL WHERE id = ?`, [id]);
}

export async function markPhrasesPracticed(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await getDatabase();
  const now = new Date().toISOString();
  for (const id of ids) {
    await db.runAsync(`UPDATE saved_phrases SET practiced_count = practiced_count + 1, last_practiced_at = ? WHERE id = ?`, [now, id]);
  }
}

// The phrases you've said least, for a round of practicing aloud: never-said
// first, then the longest ago.
export async function leastPracticedPhrases(limit = 5): Promise<SavedPhrase[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Row>(
    `SELECT * FROM saved_phrases WHERE deleted_at IS NULL
     ORDER BY practiced_count ASC, COALESCE(last_practiced_at, '') ASC, created_at DESC LIMIT ?`,
    [limit],
  );
  return rows.map(fromRow);
}
