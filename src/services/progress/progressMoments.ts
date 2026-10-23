import { getDatabase } from "../db/database";
import { getArtifact, putArtifact } from "../db/artifactsRepo";
import { getSessionById } from "../db/sessionsRepo";
import { getScoreHistoryBefore } from "../db/scoresRepo";
import type { TakeScores } from "../../domain/scoring/takeScore";
import { getPracticeDates, getSessionsDoneToday, getStreakState, type ProgressChange } from "../db/progressRepo";
import { getDailySessionGoal } from "../prefs/prefsStore";
import { describeSessionSubject } from "../sessions/sessionSubject";
import { buildMoment, type Beat, type MomentInput } from "../../domain/progressMoment";
import { isoDateFromDate, todayISODate } from "../../utils/dateUtils";
import { logger } from "../../utils/logger";
import { SKILL_LABELS } from "../../theme/tokens";

// The stored `progress` artifact of a take: the skill moves it made, and
// whether its moment has been seen. Takes from before this shape stored a
// bare ProgressChange[] — those count as seen, so nothing old pops up.
export interface ProgressArtifact {
  changes: ProgressChange[];
  settledAt: string;
  seenAt: string | null;
  // Where the take left you on the path, if it was a path lesson's rep.
  path?: MomentInput["path"];
}

export async function readProgress(sessionId: string): Promise<ProgressArtifact | null> {
  const raw = await getArtifact<ProgressArtifact | ProgressChange[]>(sessionId, "progress");
  if (!raw) return null;
  if (Array.isArray(raw)) return { changes: raw, settledAt: "", seenAt: "legacy" };
  return raw;
}

export async function saveProgress(sessionId: string, value: ProgressArtifact): Promise<void> {
  await putArtifact(sessionId, "progress", value, 2);
}

export async function markProgressSeen(sessionId: string): Promise<void> {
  const current = await readProgress(sessionId);
  if (!current || current.seenAt) return;
  await saveProgress(sessionId, { ...current, seenAt: new Date().toISOString() });
}

export interface LoadedMoment {
  beats: Beat[];
  seen: boolean;
}

// The beats for one take, or null while its progress hasn't settled.
export async function loadMoment(sessionId: string): Promise<LoadedMoment | null> {
  const [progress, session] = await Promise.all([readProgress(sessionId), getSessionById(sessionId)]);
  if (!progress || !session) return null;
  try {
    // Set against earlier takes scored in the same layer (judged or measured).
    const sheets = await getArtifact<TakeScores>(sessionId, "session_score");
    const history = await getScoreHistoryBefore(session.recordedAt, sheets?.headline ?? "measured");
    const day = isoDateFromDate(new Date(session.recordedAt));
    const today = todayISODate();
    let streakDays: number | null = null;
    let goal: MomentInput["goal"] = null;
    // The streak and the goal only mean something on the day of the take.
    if (day === today) {
      // Timestamped practice only (UTC, ending in Z): finished plans are
      // stored as a bare date, and a plan is never finished without one.
      const before = (await getPracticeDates()).filter((d) => d.endsWith("Z") && d < session.recordedAt && isoDateFromDate(new Date(d)) === day);
      if (before.length === 0) streakDays = (await getStreakState()).currentStreak;
      const g = getDailySessionGoal();
      if (g > 1) goal = { done: Math.min(await getSessionsDoneToday(), g), goal: g };
    }
    const first = progress.changes[0];
    const beats = buildMoment({
      score: session.sessionScore ?? null,
      previousScores: history.previous,
      previousBest: history.best,
      moves: progress.changes.map((c) => ({
        skill: c.skill,
        ratingBefore: c.ratingBefore,
        ratingAfter: c.ratingAfter,
        stageBefore: c.stageBefore,
        stageAfter: c.stageAfter,
      })),
      speakerLevelBefore: first?.speakerLevelBefore,
      speakerLevelAfter: first?.speakerLevelAfter,
      streakDays,
      goal,
      path: progress.path ?? null,
    });
    return { beats, seen: !!progress.seenAt };
  } catch (error) {
    logger.warn(`[progress] ${sessionId}: couldn't build the moment — ${(error as Error).message}`);
    return null;
  }
}

export interface UnseenMoment {
  sessionId: string;
  title: string;
  // The one line the Today card leads with.
  headline: string;
  settledAt: string;
}

const UNSEEN_DAYS = 3;

// Takes whose progress landed after you'd left their Result screen — the
// newest first, from the last few days.
export async function getUnseenMoments(): Promise<UnseenMoment[]> {
  const db = await getDatabase();
  const since = new Date(Date.now() - UNSEEN_DAYS * 86_400_000).toISOString();
  const rows = await db.getAllAsync<{ session_id: string; json: string }>(
    `SELECT a.session_id, a.json FROM session_artifacts a JOIN sessions s ON s.id = a.session_id
     WHERE a.kind = 'progress' AND a.created_at >= ? AND s.deleted_at IS NULL ORDER BY a.created_at DESC LIMIT 5`,
    [since],
  );
  const out: UnseenMoment[] = [];
  for (const row of rows) {
    let value: ProgressArtifact | ProgressChange[];
    try {
      value = JSON.parse(row.json);
    } catch {
      continue;
    }
    if (Array.isArray(value) || value.seenAt) continue;
    const session = await getSessionById(row.session_id);
    if (!session) continue;
    const subject = await describeSessionSubject(session);
    out.push({ sessionId: row.session_id, title: subject.title || "A recorded take", headline: headlineFor(value.changes), settledAt: value.settledAt });
  }
  return out;
}

function headlineFor(changes: ProgressChange[]): string {
  const staged = changes.find((c) => c.stagedUp);
  if (staged) return "You earned a new stage";
  const moved = [...changes].sort((a, b) => Math.abs(b.ratingAfter - b.ratingBefore) - Math.abs(a.ratingAfter - a.ratingBefore))[0];
  if (!moved) return "Your progress is in";
  const delta = Math.round((moved.ratingAfter - moved.ratingBefore) * 10) / 10;
  return delta > 0 ? `${SKILL_LABELS[moved.skill]} +${delta}` : "Your progress is in";
}
