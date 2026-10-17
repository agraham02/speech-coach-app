import { getDatabase } from "./database";
import { ALL_STEPS, type SessionStep, type StepState, type StepStatus } from "../../domain/sessionSteps";

interface StepRow {
  session_id: string;
  step: string;
  status: string;
  attempts: number;
  last_error: string | null;
  updated_at: string;
}

function rowToStep(row: StepRow): StepState {
  return {
    sessionId: row.session_id,
    step: row.step as SessionStep,
    status: row.status as StepStatus,
    attempts: row.attempts,
    lastError: row.last_error,
    updatedAt: row.updated_at,
  };
}

export async function getSessionSteps(sessionId: string): Promise<StepState[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<StepRow>(`SELECT * FROM session_steps WHERE session_id = ?`, [sessionId]);
  const order = new Map(ALL_STEPS.map((s, i) => [s, i]));
  return rows.map(rowToStep).sort((a, b) => (order.get(a.step) ?? 0) - (order.get(b.step) ?? 0));
}

// Steps for many sessions at once, grouped by session (the Dev pipeline list).
export async function getStepsForSessions(sessionIds: string[]): Promise<Map<string, StepState[]>> {
  const grouped = new Map<string, StepState[]>();
  if (sessionIds.length === 0) return grouped;
  const db = await getDatabase();
  const placeholders = sessionIds.map(() => "?").join(", ");
  const rows = await db.getAllAsync<StepRow>(`SELECT * FROM session_steps WHERE session_id IN (${placeholders})`, sessionIds);
  const order = new Map(ALL_STEPS.map((s, i) => [s, i]));
  for (const step of rows.map(rowToStep)) {
    const list = grouped.get(step.sessionId) ?? [];
    list.push(step);
    grouped.set(step.sessionId, list);
  }
  for (const list of grouped.values()) list.sort((a, b) => (order.get(a.step) ?? 0) - (order.get(b.step) ?? 0));
  return grouped;
}

export async function getStepsWithStatus(statuses: StepStatus[]): Promise<StepState[]> {
  const db = await getDatabase();
  const placeholders = statuses.map(() => "?").join(", ");
  const rows = await db.getAllAsync<StepRow>(`SELECT * FROM session_steps WHERE status IN (${placeholders})`, statuses);
  return rows.map(rowToStep);
}

// Inserts the step if missing, otherwise updates it. `bumpAttempts` is set
// when a step starts running.
export async function setStepStatus(
  sessionId: string,
  step: SessionStep,
  status: StepStatus,
  options: { lastError?: string | null; bumpAttempts?: boolean } = {},
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const lastError = options.lastError === undefined ? null : options.lastError;
  await db.runAsync(
    `INSERT INTO session_steps (session_id, step, status, attempts, last_error, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id, step) DO UPDATE SET
       status = excluded.status,
       attempts = session_steps.attempts + ?,
       last_error = excluded.last_error,
       updated_at = excluded.updated_at`,
    [sessionId, step, status, options.bumpAttempts ? 1 : 0, lastError, now, options.bumpAttempts ? 1 : 0],
  );
}

// Seeds every step for a new session in one go. Steps not requested start
// as "skipped" so the Result screen can offer them as actions later.
export async function seedSessionSteps(sessionId: string, statuses: Record<SessionStep, StepStatus>): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  for (const step of ALL_STEPS) {
    await db.runAsync(
      `INSERT OR REPLACE INTO session_steps (session_id, step, status, attempts, last_error, updated_at) VALUES (?, ?, ?, 0, NULL, ?)`,
      [sessionId, step, statuses[step], now],
    );
  }
}
