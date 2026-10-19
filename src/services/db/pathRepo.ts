import { getDatabase } from "./database";
import { generateId } from "../../utils/generateId";
import type { PathChange, PathReason, PathStatus, PathUnit } from "../../domain/path";

// Your stored path (domain/path.ts): the unit order and why each is there,
// plus the log of times it moved. Plain storage — services/path/pathService
// decides when it's built and re-planned.

export interface StoredPathUnit extends PathUnit {
  position: number;
  startedAt: string | null;
  completedAt: string | null;
}

interface Row {
  unit_id: string;
  position: number;
  status: string;
  reasons_json: string;
  started_at: string | null;
  completed_at: string | null;
}

function parseReasons(json: string): PathReason[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function readPath(): Promise<StoredPathUnit[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Row>(`SELECT * FROM path_units ORDER BY position`);
  return rows.map((r) => ({
    unitId: r.unit_id,
    status: r.status as PathStatus,
    reasons: parseReasons(r.reasons_json),
    position: r.position,
    startedAt: r.started_at,
    completedAt: r.completed_at,
  }));
}

// Replaces the stored order, keeping when each unit started and finished:
// a unit starts the first time it's active, and finishes when it's done.
export async function writePath(path: PathUnit[]): Promise<void> {
  const db = await getDatabase();
  const existing = new Map((await readPath()).map((p) => [p.unitId, p]));
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM path_units`);
    for (const [position, p] of path.entries()) {
      const prev = existing.get(p.unitId);
      const startedAt = prev?.startedAt ?? (p.status === "active" || p.status === "done" ? now : null);
      const completedAt = p.status === "done" ? prev?.completedAt ?? now : null;
      await db.runAsync(
        `INSERT INTO path_units (unit_id, position, status, reasons_json, started_at, completed_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [p.unitId, position, p.status, JSON.stringify(p.reasons), startedAt, completedAt],
      );
    }
  });
}

// The units still to do, in order — what the daily plan follows.
export async function getPathOrder(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ unit_id: string }>(`SELECT unit_id FROM path_units WHERE status IN ('active', 'upcoming') ORDER BY position`);
  return rows.map((r) => r.unit_id);
}

export interface StoredPathChange {
  id: string;
  at: string;
  changes: PathChange[];
  seenAt: string | null;
}

export async function recordPathChange(changes: PathChange[]): Promise<void> {
  if (changes.length === 0) return;
  const db = await getDatabase();
  await db.runAsync(`INSERT INTO path_changes (id, at, summary_json, seen_at) VALUES (?, ?, ?, NULL)`, [
    generateId(),
    new Date().toISOString(),
    JSON.stringify(changes),
  ]);
}

// The newest change you haven't dismissed yet.
export async function getUnseenPathChange(): Promise<StoredPathChange | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: string; at: string; summary_json: string; seen_at: string | null }>(
    `SELECT * FROM path_changes WHERE seen_at IS NULL ORDER BY at DESC LIMIT 1`,
  );
  if (!row) return null;
  let changes: PathChange[] = [];
  try {
    changes = JSON.parse(row.summary_json);
  } catch {
    changes = [];
  }
  return { id: row.id, at: row.at, changes, seenAt: row.seen_at };
}

export async function markPathChangesSeen(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE path_changes SET seen_at = ? WHERE seen_at IS NULL`, [new Date().toISOString()]);
}
