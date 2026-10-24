import { getDatabase } from "./database";
import { scorePointOf, type ScorePoint } from "../../domain/trends";
import type { TakeScores } from "../../domain/scoring/takeScore";

// Every scored impromptu take's two score sheets, oldest first, as trend
// points. Script readings are left out (their categories differ, so their
// overall isn't comparable); a deleted take is hidden at once.
export async function getScoreSeries(): Promise<ScorePoint[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ recorded_at: string; json: string }>(
    `SELECT s.recorded_at, a.json
     FROM sessions s JOIN session_artifacts a ON a.session_id = s.id AND a.kind = 'session_score'
     WHERE s.status = 'done' AND s.deleted_at IS NULL AND s.session_type NOT IN ('script_practice', 'feeling')
     ORDER BY s.recorded_at ASC`,
  );
  const out: ScorePoint[] = [];
  for (const row of rows) {
    try {
      out.push(scorePointOf(row.recorded_at, JSON.parse(row.json) as TakeScores));
    } catch {
      // A malformed sheet is skipped; the next rescore rewrites it.
    }
  }
  return out;
}

// Every completed session's date, regardless of whether it has scores — used
// for streaks, since practicing (not grading) is what a streak measures.
export async function getCompletedSessionDates(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ recorded_at: string }>(
    `SELECT recorded_at FROM sessions WHERE status = 'done' AND deleted_at IS NULL ORDER BY recorded_at ASC`,
  );
  return rows.map((row) => row.recorded_at);
}

export interface SessionMetricPoint {
  recordedAt: string;
  wpm: number | null;
  fillerRate: number | null;
  // Gaze-measured eye contact only (older head-pose-only takes are null).
  eyeContact: number | null;
}

// On-device measurements per finished impromptu session, oldest first —
// the Progress charts. Uses SQLite's JSON functions so the full word list
// never has to be loaded into JS.
export async function getSessionMetricSeries(limit = 30): Promise<SessionMetricPoint[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    recorded_at: string;
    duration_seconds: number;
    word_count: number | null;
    filler_rate_per_minute: number | null;
    eye_contact: number | null;
  }>(
    `SELECT * FROM (
       SELECT s.recorded_at, s.duration_seconds, s.filler_rate_per_minute,
              json_array_length(s.transcript_words_json) AS word_count,
              CASE WHEN json_extract(a.json, '$.eyeContactSource') = 'gaze' THEN json_extract(a.json, '$.eyeContactPercent') END AS eye_contact
       FROM sessions s
       LEFT JOIN session_artifacts a ON a.session_id = s.id AND a.kind = 'presence'
       WHERE s.status = 'done' AND s.deleted_at IS NULL AND s.session_type IN ('spontaneous', 'concise', 'free_record')
       ORDER BY s.recorded_at DESC LIMIT ?
     ) ORDER BY recorded_at ASC`,
    [limit],
  );
  return rows.map((r) => ({
    recordedAt: r.recorded_at,
    wpm: r.word_count && r.duration_seconds > 0 ? Math.round(r.word_count / (r.duration_seconds / 60)) : null,
    fillerRate: r.filler_rate_per_minute,
    eyeContact: r.eye_contact,
  }));
}

// The same on-device measurements for one session, and for your previous
// take of the same prompt — the Result screen's before/after comparison.
export async function getPromptComparison(
  sessionId: string,
): Promise<{ current: SessionMetricPoint; previous: SessionMetricPoint } | null> {
  const db = await getDatabase();
  type Row = { recorded_at: string; duration_seconds: number; word_count: number | null; filler_rate_per_minute: number | null; eye_contact: number | null };
  const select = `SELECT s.recorded_at, s.duration_seconds, s.filler_rate_per_minute,
                         json_array_length(s.transcript_words_json) AS word_count,
                         CASE WHEN json_extract(a.json, '$.eyeContactSource') = 'gaze' THEN json_extract(a.json, '$.eyeContactPercent') END AS eye_contact
                  FROM sessions s
                  LEFT JOIN session_artifacts a ON a.session_id = s.id AND a.kind = 'presence'`;
  const current = await db.getFirstAsync<Row & { prompt_id: string }>(`${select.replace("SELECT ", "SELECT s.prompt_id, ")} WHERE s.id = ?`, [sessionId]);
  if (!current) return null;
  const previous = await db.getFirstAsync<Row>(
    `${select} WHERE s.prompt_id = ? AND s.id != ? AND s.deleted_at IS NULL AND s.status = 'done' AND s.recorded_at < ?
     ORDER BY s.recorded_at DESC LIMIT 1`,
    [current.prompt_id, sessionId, current.recorded_at],
  );
  if (!previous) return null;
  const toPoint = (r: Row): SessionMetricPoint => ({
    recordedAt: r.recorded_at,
    wpm: r.word_count && r.duration_seconds > 0 ? Math.round(r.word_count / (r.duration_seconds / 60)) : null,
    fillerRate: r.filler_rate_per_minute,
    eyeContact: r.eye_contact,
  });
  return { current: toPoint(current), previous: toPoint(previous) };
}

export interface WeekSummary {
  practiceDays: number;
  reps: number;
  drills: number;
  avgDrillScore: number | null; // 0-100
}

function weekStart(offsetWeeks: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - offsetWeeks * 7);
  return d;
}

async function summarizeWeek(offsetWeeks: number): Promise<WeekSummary> {
  const db = await getDatabase();
  const from = weekStart(offsetWeeks).toISOString();
  const to = weekStart(offsetWeeks - 1).toISOString();
  const reps = await db.getFirstAsync<{ n: number; days: number }>(
    `SELECT COUNT(*) AS n, COUNT(DISTINCT substr(recorded_at, 1, 10)) AS days FROM sessions
     WHERE status = 'done' AND deleted_at IS NULL AND recorded_at >= ? AND recorded_at < ?`,
    [from, to],
  );
  const drills = await db.getFirstAsync<{ n: number; avg: number | null; days: number }>(
    // Conversation drills count as practice but stay out of the average:
    // their scores measure process, not quality.
    `SELECT COUNT(*) AS n, AVG(CASE WHEN skill IS NULL OR skill != 'conversation' THEN score END) AS avg,
            COUNT(DISTINCT substr(started_at, 1, 10)) AS days FROM drill_attempts
     WHERE started_at >= ? AND started_at < ?`,
    [from, to],
  );
  return {
    practiceDays: Math.max(reps?.days ?? 0, drills?.days ?? 0),
    reps: reps?.n ?? 0,
    drills: drills?.n ?? 0,
    avgDrillScore: drills?.avg != null ? Math.round(drills.avg * 100) : null,
  };
}

export async function getWeeklySummaries(): Promise<{ thisWeek: WeekSummary; lastWeek: WeekSummary }> {
  const [thisWeek, lastWeek] = await Promise.all([summarizeWeek(0), summarizeWeek(1)]);
  return { thisWeek, lastWeek };
}

// How much they've used the app, for deciding when to ask for feedback
// (domain/feedbackPrompt.ts). Days are counted loosely; it's only a threshold.
export async function getUsageTotals(): Promise<{ reps: number; days: number }> {
  const db = await getDatabase();
  const reps = await db.getFirstAsync<{ n: number; days: number }>(
    `SELECT COUNT(*) AS n, COUNT(DISTINCT substr(recorded_at, 1, 10)) AS days FROM sessions WHERE status = 'done' AND deleted_at IS NULL`,
  );
  const drills = await db.getFirstAsync<{ n: number; days: number }>(
    `SELECT COUNT(*) AS n, COUNT(DISTINCT substr(started_at, 1, 10)) AS days FROM drill_attempts`,
  );
  return { reps: (reps?.n ?? 0) + (drills?.n ?? 0), days: Math.max(reps?.days ?? 0, drills?.days ?? 0) };
}
