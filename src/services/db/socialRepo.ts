import { getDatabase } from "./database";
import { generateId } from "../../utils/generateId";
import type { PredictionPair } from "../../domain/conversation/realWorld";

// The Conversation skill's real-world loop: Prime (before an event) →
// Debrief (after), and the moments you blanked, which come back as
// replay practice. Migration v16.

export interface SocialEvent {
  id: string;
  createdAt: string;
  label: string | null;
  topics: string[];
  questions: string[];
  outwardGoal: string | null;
  predictedAwkward: number | null;
  happenedAt: string | null;
  debrief: Debrief | null;
  actualAwkward: number | null;
  completedAt: string | null;
}

export interface Debrief {
  wentOkay: string;
  tryNext: string;
  positiveSign: string;
}

export interface BlankMoment {
  id: string;
  eventId: string | null;
  text: string;
  createdAt: string;
  practicedCount: number;
  lastPracticedAt: string | null;
}

interface EventRow {
  id: string;
  created_at: string;
  label: string | null;
  topics_json: string | null;
  questions_json: string | null;
  outward_goal: string | null;
  predicted_awkward: number | null;
  happened_at: string | null;
  debrief_json: string | null;
  actual_awkward: number | null;
  completed_at: string | null;
}

function parseList(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function toEvent(r: EventRow): SocialEvent {
  let debrief: Debrief | null = null;
  if (r.debrief_json) {
    try {
      debrief = JSON.parse(r.debrief_json);
    } catch {
      debrief = null;
    }
  }
  return {
    id: r.id,
    createdAt: r.created_at,
    label: r.label,
    topics: parseList(r.topics_json),
    questions: parseList(r.questions_json),
    outwardGoal: r.outward_goal,
    predictedAwkward: r.predicted_awkward,
    happenedAt: r.happened_at,
    debrief,
    actualAwkward: r.actual_awkward,
    completedAt: r.completed_at,
  };
}

const clean = (list: string[]) => list.map((s) => s.trim()).filter(Boolean);

export async function createPrimedEvent(input: {
  label: string;
  topics: string[];
  questions: string[];
  outwardGoal: string | null;
  predictedAwkward: number | null;
}): Promise<string> {
  const db = await getDatabase();
  const id = generateId();
  await db.runAsync(
    `INSERT INTO social_events (id, created_at, label, topics_json, questions_json, outward_goal, predicted_awkward) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      new Date().toISOString(),
      input.label.trim() || null,
      JSON.stringify(clean(input.topics)),
      JSON.stringify(clean(input.questions)),
      input.outwardGoal?.trim() || null,
      input.predictedAwkward,
    ],
  );
  return id;
}

// Primed but not yet debriefed, newest first. Events older than a week are
// treated as forgotten rather than nagging forever.
export async function getOpenEvents(): Promise<SocialEvent[]> {
  const db = await getDatabase();
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const rows = await db.getAllAsync<EventRow>(
    `SELECT * FROM social_events WHERE completed_at IS NULL AND created_at >= ? ORDER BY created_at DESC`,
    [since],
  );
  return rows.map(toEvent);
}

// Saves a debrief — onto a primed event, or as a new event when there was
// no Prime. Blank moments are stored alongside for replay practice.
export async function saveDebrief(input: {
  eventId?: string | null;
  label?: string;
  debrief: Debrief;
  actualAwkward: number | null;
  blankMoments: string[];
}): Promise<string> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  let id = input.eventId ?? null;
  await db.withTransactionAsync(async () => {
    if (id) {
      await db.runAsync(`UPDATE social_events SET debrief_json = ?, actual_awkward = ?, happened_at = COALESCE(happened_at, ?), completed_at = ? WHERE id = ?`, [
        JSON.stringify(input.debrief),
        input.actualAwkward,
        now,
        now,
        id,
      ]);
    } else {
      id = generateId();
      await db.runAsync(
        `INSERT INTO social_events (id, created_at, label, debrief_json, actual_awkward, happened_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, now, input.label?.trim() || null, JSON.stringify(input.debrief), input.actualAwkward, now, now],
      );
    }
    for (const text of clean(input.blankMoments)) {
      await db.runAsync(`INSERT INTO blank_moments (id, event_id, text, created_at) VALUES (?, ?, ?, ?)`, [generateId(), id, text, now]);
    }
  });
  return id!;
}

// Pairs for the predicted-vs-actual chart, oldest first.
export async function getPredictionPairs(limit = 30): Promise<(PredictionPair & { at: string })[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ predicted_awkward: number; actual_awkward: number; completed_at: string }>(
    `SELECT predicted_awkward, actual_awkward, completed_at FROM social_events
     WHERE predicted_awkward IS NOT NULL AND actual_awkward IS NOT NULL AND completed_at IS NOT NULL
     ORDER BY completed_at DESC LIMIT ?`,
    [limit],
  );
  return rows.reverse().map((r) => ({ predicted: r.predicted_awkward, actual: r.actual_awkward, at: r.completed_at }));
}

interface BlankRow {
  id: string;
  event_id: string | null;
  text: string;
  created_at: string;
  practiced_count: number;
  last_practiced_at: string | null;
}

function toBlank(r: BlankRow): BlankMoment {
  return { id: r.id, eventId: r.event_id, text: r.text, createdAt: r.created_at, practicedCount: r.practiced_count, lastPracticedAt: r.last_practiced_at };
}

// Least-practiced first, so every moment gets its turn.
export async function getBlankMoments(): Promise<BlankMoment[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<BlankRow>(
    `SELECT * FROM blank_moments WHERE deleted_at IS NULL ORDER BY practiced_count ASC, created_at DESC`,
  );
  return rows.map(toBlank);
}

export async function getBlankMoment(id: string): Promise<BlankMoment | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<BlankRow>(`SELECT * FROM blank_moments WHERE id = ? AND deleted_at IS NULL`, [id]);
  return row ? toBlank(row) : null;
}

export async function markBlankMomentPracticed(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE blank_moments SET practiced_count = practiced_count + 1, last_practiced_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
}

export async function deleteBlankMoment(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE blank_moments SET deleted_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
}
