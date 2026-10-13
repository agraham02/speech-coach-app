import { getDatabase } from "./database";
import { generateId } from "../../utils/generateId";
import { sanitizeMarks, wordsOf, type Mark } from "../../domain/cadence/marks";

// Your own Mark It Up texts: lines picked from something you pasted or
// scanned, and edited copies of built-in lines or speeches.

export type MarkedShelf = "line" | "speech";

export interface SavedMarkedText {
  id: string;
  title: string;
  shelf: MarkedShelf;
  sourceId: string | null;
  text: string;
  marks: Mark[];
  autoMarked: boolean;
  createdAt: string;
  lastPracticedAt: string | null;
}

interface Row {
  id: string;
  title: string;
  shelf: string;
  source_id: string | null;
  text: string;
  marks_json: string;
  auto_marked: number;
  created_at: string;
  last_practiced_at: string | null;
}

function fromRow(r: Row): SavedMarkedText {
  let marks: Mark[] = [];
  try {
    marks = sanitizeMarks(JSON.parse(r.marks_json), wordsOf(r.text).length);
  } catch {
    marks = [];
  }
  return {
    id: r.id,
    title: r.title,
    shelf: r.shelf === "speech" ? "speech" : "line",
    sourceId: r.source_id,
    text: r.text,
    marks,
    autoMarked: r.auto_marked === 1,
    createdAt: r.created_at,
    lastPracticedAt: r.last_practiced_at,
  };
}

export async function listMarkedTexts(): Promise<SavedMarkedText[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Row>(`SELECT * FROM marked_texts WHERE deleted_at IS NULL ORDER BY created_at DESC`);
  return rows.map(fromRow);
}

export async function getMarkedText(id: string): Promise<SavedMarkedText | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Row>(`SELECT * FROM marked_texts WHERE id = ? AND deleted_at IS NULL`, [id]);
  return row ? fromRow(row) : null;
}

export async function saveMarkedText(input: {
  id?: string;
  title: string;
  shelf: MarkedShelf;
  sourceId?: string | null;
  text: string;
  marks: Mark[];
  autoMarked?: boolean;
}): Promise<string> {
  const db = await getDatabase();
  const id = input.id ?? generateId();
  const marks = sanitizeMarks(input.marks, wordsOf(input.text).length);
  await db.runAsync(
    `INSERT INTO marked_texts (id, title, shelf, source_id, text, marks_json, auto_marked, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, text = excluded.text, marks_json = excluded.marks_json,
       auto_marked = excluded.auto_marked`,
    [id, input.title, input.shelf, input.sourceId ?? null, input.text, JSON.stringify(marks), input.autoMarked ? 1 : 0, new Date().toISOString()],
  );
  return id;
}

export async function deleteMarkedText(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE marked_texts SET deleted_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
}

export async function markTextsPracticed(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await getDatabase();
  const now = new Date().toISOString();
  for (const id of ids) await db.runAsync(`UPDATE marked_texts SET last_practiced_at = ? WHERE id = ?`, [now, id]);
}

// Built-in line ids practiced recently, so a rep doesn't repeat them.
export async function getRecentLineIds(limit = 30): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ content_id: string | null }>(
    `SELECT content_id FROM drill_attempts WHERE drill_type = 'marked_reading' AND content_id IS NOT NULL ORDER BY started_at DESC LIMIT ?`,
    [limit],
  );
  return rows.flatMap((r) => (r.content_id ? r.content_id.split(",") : []));
}
