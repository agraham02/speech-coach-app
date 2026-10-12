import { getDatabase } from "./database";
import { getCompletedSessionDates } from "./statsRepo";
import { getDrillCompletionDates } from "./drillsRepo";
import { generateId } from "../../utils/generateId";
import { isoDateFromDate, todayISODate } from "../../utils/dateUtils";
import { buildTopUpPlan } from "../../domain/dailyGoal";
import { priorityFor } from "../../domain/profile";
import { getUserProfile } from "../prefs/prefsStore";
import type { SkillId } from "../../theme/tokens";
import { DRILL_SKILL, type DrillOutcome, type DrillType } from "../../domain/drills/drillSpecs";
import {
  INITIAL_RATING,
  MIN_LEVEL,
  SKILLS,
  nextDifficulty,
  nextReviewIntervalDays,
  updateRating,
  type SkillRating,
} from "../../domain/mastery";
import { buildDailyPlan, PLAN_VERSION, type DailyPlan, type PlanMinutes } from "../../domain/dailyPlan";
import type { CoachOutput, Verdict } from "../../domain/coach/ruleCoach";
import { getLesson } from "../../content/lessons";
import { summarizeAttempt, type AttemptSummary } from "../../domain/conversation/attemptMetrics";

// Curriculum v2 persistence: skill mastery, adaptive drill difficulty,
// lesson progress, daily plans and review passes.

export interface SkillState extends SkillRating {
  lastPracticedAt: string | null;
}

export async function getSkillStates(): Promise<Record<SkillId, SkillState>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ skill: string; rating: number; attempts: number; last_practiced_at: string | null }>(
    `SELECT * FROM skill_mastery`,
  );
  const out = {} as Record<SkillId, SkillState>;
  for (const skill of SKILLS) out[skill] = { rating: INITIAL_RATING, attempts: 0, lastPracticedAt: null };
  for (const row of rows) {
    if ((SKILLS as string[]).includes(row.skill)) {
      out[row.skill as SkillId] = { rating: row.rating, attempts: row.attempts, lastPracticedAt: row.last_practiced_at };
    }
  }
  return out;
}

async function saveSkill(skill: SkillId, state: SkillState): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO skill_mastery (skill, rating, attempts, last_practiced_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(skill) DO UPDATE SET rating = excluded.rating, attempts = excluded.attempts, last_practiced_at = excluded.last_practiced_at`,
    [skill, state.rating, state.attempts, state.lastPracticedAt],
  );
}

// Starting ratings from the onboarding skill check. Only for skills with no
// practice history yet — real attempts always outrank a five-minute sample.
export async function seedSkillRatings(ratings: Partial<Record<SkillId, number | null>>): Promise<void> {
  const skills = await getSkillStates();
  for (const skill of SKILLS) {
    const rating = ratings[skill];
    if (rating == null || skills[skill].attempts > 0) continue;
    await saveSkill(skill, { rating, attempts: 0, lastPracticedAt: skills[skill].lastPracticedAt });
  }
}

export async function getDrillLevel(type: DrillType): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ level: number }>(`SELECT level FROM drill_difficulty WHERE drill_type = ?`, [type]);
  return row?.level ?? MIN_LEVEL;
}

export async function getAllDrillLevels(): Promise<Partial<Record<DrillType, { level: number; attempts: number; successes: number }>>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ drill_type: string; level: number; attempts: number; successes: number }>(`SELECT * FROM drill_difficulty`);
  return Object.fromEntries(rows.map((r) => [r.drill_type, { level: r.level, attempts: r.attempts, successes: r.successes }]));
}

async function saveDrillLevel(type: DrillType, level: number, success: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO drill_difficulty (drill_type, level, attempts, successes, updated_at) VALUES (?, ?, 1, ?, ?)
     ON CONFLICT(drill_type) DO UPDATE SET level = excluded.level, attempts = drill_difficulty.attempts + 1,
       successes = drill_difficulty.successes + ?, updated_at = excluded.updated_at`,
    [type, level, success ? 1 : 0, new Date().toISOString(), success ? 1 : 0],
  );
}

export interface ProgressChange {
  skill: SkillId;
  ratingBefore: number;
  ratingAfter: number;
  levelBefore: number;
  levelAfter: number;
  // Crossed into a new whole difficulty level — worth celebrating.
  leveledUp: boolean;
}

// Records one scored drill attempt: logs it, moves the drill's difficulty on
// the staircase, and updates the skill's mastery rating.
export async function recordDrillOutcome(args: {
  drillType: DrillType;
  outcome: DrillOutcome;
  level: number;
  contentId?: string;
  lessonId?: string;
  metrics?: unknown;
  wpm?: number | null;
  accuracyPercent?: number | null;
  // Overrides the drill type's skill (guided exercises serve several skills).
  skill?: SkillId;
}): Promise<ProgressChange> {
  const db = await getDatabase();
  const skill = args.skill ?? DRILL_SKILL[args.drillType];
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO drill_attempts (id, drill_type, content_id, started_at, mode, accuracy_percent, wpm, metrics_json, skill, lesson_id, drill_level, score, success)
     VALUES (?, ?, ?, ?, 'live', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      generateId(),
      args.drillType,
      args.contentId ?? null,
      now,
      args.accuracyPercent ?? null,
      args.wpm ?? null,
      args.metrics === undefined ? null : JSON.stringify(args.metrics),
      skill,
      args.lessonId ?? null,
      args.level,
      args.outcome.score,
      args.outcome.success ? 1 : 0,
    ],
  );
  const levelAfter = nextDifficulty(args.level, args.outcome.success);
  await saveDrillLevel(args.drillType, levelAfter, args.outcome.success);

  const skills = await getSkillStates();
  const before = skills[skill];
  const updated = updateRating(before, args.outcome.score, args.level);
  await saveSkill(skill, { ...updated, lastPracticedAt: now });
  return {
    skill,
    ratingBefore: before.rating,
    ratingAfter: updated.rating,
    levelBefore: args.level,
    levelAfter,
    leveledUp: Math.floor(levelAfter) > Math.floor(args.level),
  };
}

const VERDICT_SCORE: Record<Verdict, number> = { good: 0.9, ok: 0.6, work: 0.3 };

// Turns the coach's measured observations for an impromptu rep into skill
// updates — this is how real speaking (not just drills) moves mastery,
// without needing any cloud grading.
export async function recordRepOutcome(coach: CoachOutput): Promise<ProgressChange[]> {
  const bySkill = new Map<SkillId, number[]>();
  for (const o of coach.observations) {
    const list = bySkill.get(o.skill) ?? [];
    list.push(VERDICT_SCORE[o.verdict]);
    bySkill.set(o.skill, list);
  }
  if (bySkill.size === 0) return [];
  const level = await getDrillLevel("rep");
  const skills = await getSkillStates();
  const now = new Date().toISOString();
  const changes: ProgressChange[] = [];
  let total = 0;
  let n = 0;
  for (const [skill, scores] of bySkill) {
    const score = scores.reduce((a, b) => a + b, 0) / scores.length;
    total += score;
    n += 1;
    const updated = updateRating(skills[skill], score, level);
    await saveSkill(skill, { ...updated, lastPracticedAt: now });
    changes.push({ skill, ratingBefore: skills[skill].rating, ratingAfter: updated.rating, levelBefore: level, levelAfter: level, leveledUp: false });
  }
  const success = total / n >= 0.7;
  const levelAfter = nextDifficulty(level, success);
  await saveDrillLevel("rep", levelAfter, success);
  return changes.map((c) => ({ ...c, levelAfter, leveledUp: Math.floor(levelAfter) > Math.floor(level) }));
}

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

export interface LessonState {
  done: boolean;
  completedAt: string | null;
  attempts: number;
  lastScore: number | null;
  reviewIntervalDays: number | null;
  nextReviewAt: string | null;
}

export async function getLessonStates(): Promise<Record<string, LessonState>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    lesson_id: string;
    done: number;
    completed_at: string | null;
    attempts: number;
    last_score: number | null;
    review_interval_days: number | null;
    next_review_at: string | null;
  }>(`SELECT * FROM lesson_progress`);
  return Object.fromEntries(
    rows.map((r) => [
      r.lesson_id,
      {
        done: r.done === 1,
        completedAt: r.completed_at,
        attempts: r.attempts,
        lastScore: r.last_score,
        reviewIntervalDays: r.review_interval_days,
        nextReviewAt: r.next_review_at,
      },
    ]),
  );
}

export async function completeLesson(lessonId: string, score: number, success: boolean): Promise<void> {
  if (!getLesson(lessonId)) return;
  const db = await getDatabase();
  const existing = (await getLessonStates())[lessonId];
  const interval = nextReviewIntervalDays(existing?.reviewIntervalDays ?? null, success);
  const next = new Date(Date.now() + interval * 86_400_000).toISOString();
  await db.runAsync(
    `INSERT INTO lesson_progress (lesson_id, done, completed_at, attempts, last_score, review_interval_days, next_review_at)
     VALUES (?, 1, ?, 1, ?, ?, ?)
     ON CONFLICT(lesson_id) DO UPDATE SET done = 1, completed_at = excluded.completed_at, attempts = lesson_progress.attempts + 1,
       last_score = excluded.last_score, review_interval_days = excluded.review_interval_days, next_review_at = excluded.next_review_at`,
    [lessonId, new Date().toISOString(), score, interval, next],
  );
}

// ---------------------------------------------------------------------------
// Daily plans
// ---------------------------------------------------------------------------

export interface StoredPlan {
  plan: DailyPlan;
  completedStepIds: string[];
  completedAt: string | null;
}

async function readPlan(date: string): Promise<StoredPlan | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ plan_json: string; completed_steps_json: string; completed_at: string | null }>(
    `SELECT * FROM daily_plans WHERE date = ?`,
    [date],
  );
  if (!row) return null;
  return { plan: JSON.parse(row.plan_json), completedStepIds: JSON.parse(row.completed_steps_json), completedAt: row.completed_at };
}

// Today's plan — generated once per day and stored, so it can be resumed.
// `regenerate` swaps it (only allowed before any step is done).
export async function getTodaysPlan(minutes: PlanMinutes, regenerate = false): Promise<StoredPlan> {
  const date = todayISODate();
  const existing = await readPlan(date);
  const outdated = existing && (existing.plan.version ?? 1) < PLAN_VERSION;
  if (existing && !regenerate && !outdated && existing.plan.minutes === minutes) return existing;
  if (existing && existing.completedStepIds.length > 0) return existing;

  const db = await getDatabase();
  const [skills, lessons, recent] = await Promise.all([
    getSkillStates(),
    getLessonStates(),
    db.getAllAsync<{ plan_json: string }>(`SELECT plan_json FROM daily_plans WHERE date < ? ORDER BY date DESC LIMIT 2`, [date]),
  ]);
  const plan = buildDailyPlan({
    date,
    minutes,
    skills: Object.fromEntries(SKILLS.map((s) => [s, { rating: skills[s].rating, lastPracticedAt: skills[s].lastPracticedAt }])) as Record<
      SkillId,
      { rating: number; lastPracticedAt: string | null }
    >,
    recentFocus: recent.map((r) => (JSON.parse(r.plan_json) as DailyPlan).focusSkill),
    lessons: Object.fromEntries(Object.entries(lessons).map(([id, l]) => [id, { done: l.done, nextReviewAt: l.nextReviewAt }])),
    priority: priorityFor(getUserProfile(), date),
  });
  await db.runAsync(
    `INSERT OR REPLACE INTO daily_plans (date, plan_json, completed_steps_json, completed_at) VALUES (?, ?, '[]', NULL)`,
    [date, JSON.stringify(plan)],
  );
  return { plan, completedStepIds: [], completedAt: null };
}

export async function completePlanStep(date: string, stepId: string): Promise<StoredPlan | null> {
  const stored = await readPlan(date);
  if (!stored) return null;
  const ids = stored.completedStepIds.includes(stepId) ? stored.completedStepIds : [...stored.completedStepIds, stepId];
  const allDone = stored.plan.steps.every((s) => ids.includes(s.id));
  const db = await getDatabase();
  await db.runAsync(`UPDATE daily_plans SET completed_steps_json = ?, completed_at = ? WHERE date = ?`, [
    JSON.stringify(ids),
    allDone ? stored.completedAt ?? new Date().toISOString() : null,
    date,
  ]);
  if (allDone && !stored.completedAt) {
    // Finishing the daily plan completes its lesson for spaced review.
    await completeLesson(stored.plan.lessonId, 0.8, true);
  }
  return { ...stored, completedStepIds: ids, completedAt: allDone ? stored.completedAt ?? new Date().toISOString() : null };
}

// ---------------------------------------------------------------------------
// Daily goal: top-up sessions (2 and 3)
// ---------------------------------------------------------------------------

async function readTopUp(date: string, slot: number): Promise<StoredPlan | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ plan_json: string; completed_steps_json: string; completed_at: string | null }>(
    `SELECT * FROM daily_topups WHERE date = ? AND slot = ?`,
    [date, slot],
  );
  if (!row) return null;
  return { plan: JSON.parse(row.plan_json), completedStepIds: JSON.parse(row.completed_steps_json), completedAt: row.completed_at };
}

// Today's top-up for a slot — built once on a skill today hasn't touched yet,
// then stored so it can be resumed.
export async function getTopUpPlan(slot: 1 | 2, options: { quiet?: boolean } = {}): Promise<StoredPlan> {
  const date = todayISODate();
  const existing = await readTopUp(date, slot);
  if (existing) return existing;
  const [main, other, skills, lessons] = await Promise.all([readPlan(date), readTopUp(date, slot === 1 ? 2 : 1), getSkillStates(), getLessonStates()]);
  const doneSkills = [main?.plan.focusSkill, other?.plan.focusSkill].filter((s): s is SkillId => !!s);
  const plan = buildTopUpPlan({
    date,
    minutes: 5,
    slot,
    doneSkills,
    quiet: options.quiet,
    skills: Object.fromEntries(SKILLS.map((k) => [k, { rating: skills[k].rating, lastPracticedAt: skills[k].lastPracticedAt }])) as Record<
      SkillId,
      { rating: number; lastPracticedAt: string | null }
    >,
    recentFocus: [],
    lessons: Object.fromEntries(Object.entries(lessons).map(([id, l]) => [id, { done: l.done, nextReviewAt: l.nextReviewAt }])),
  });
  const db = await getDatabase();
  await db.runAsync(`INSERT OR REPLACE INTO daily_topups (date, slot, plan_json, completed_steps_json, completed_at) VALUES (?, ?, ?, '[]', NULL)`, [
    date,
    slot,
    JSON.stringify(plan),
  ]);
  return { plan, completedStepIds: [], completedAt: null };
}

// Which top-up slots are finished today.
export async function getCompletedTopUpSlots(date = todayISODate()): Promise<number[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ slot: number }>(`SELECT slot FROM daily_topups WHERE date = ? AND completed_at IS NOT NULL`, [date]);
  return rows.map((r) => r.slot);
}

export async function completeTopUpStep(date: string, slot: number, stepId: string): Promise<StoredPlan | null> {
  const stored = await readTopUp(date, slot);
  if (!stored) return null;
  const ids = stored.completedStepIds.includes(stepId) ? stored.completedStepIds : [...stored.completedStepIds, stepId];
  const allDone = stored.plan.steps.every((s) => ids.includes(s.id));
  const completedAt = allDone ? stored.completedAt ?? new Date().toISOString() : null;
  const db = await getDatabase();
  await db.runAsync(`UPDATE daily_topups SET completed_steps_json = ?, completed_at = ? WHERE date = ? AND slot = ?`, [JSON.stringify(ids), completedAt, date, slot]);
  return { ...stored, completedStepIds: ids, completedAt };
}

// Sessions done per local day: the first counts for any practice that day
// (the plan or anything else); each finished top-up adds one.
export async function getDailySessionCounts(): Promise<Record<string, number>> {
  const db = await getDatabase();
  const [practice, topups] = await Promise.all([
    getPracticeDates(),
    db.getAllAsync<{ date: string }>(`SELECT date FROM daily_topups WHERE completed_at IS NOT NULL`),
  ]);
  const counts: Record<string, number> = {};
  // recorded_at / started_at are UTC datetimes: use their local date.
  for (const d of practice) counts[d.length > 10 ? isoDateFromDate(new Date(d)) : d] = 1;
  for (const t of topups) counts[t.date] = (counts[t.date] ?? 1) + 1;
  return counts;
}

export async function getSessionsDoneToday(): Promise<number> {
  return (await getDailySessionCounts())[todayISODate()] ?? 0;
}

export async function getPlanCompletionDates(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ date: string }>(`SELECT date FROM daily_plans WHERE completed_at IS NOT NULL ORDER BY date`);
  return rows.map((r) => r.date);
}

// ---------------------------------------------------------------------------
// Three-pass review
// ---------------------------------------------------------------------------

export type ReviewPass = "watch" | "listen" | "both";

export async function markReviewPass(sessionId: string, pass: ReviewPass): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`INSERT OR IGNORE INTO review_passes (session_id, pass, completed_at) VALUES (?, ?, ?)`, [
    sessionId,
    pass,
    new Date().toISOString(),
  ]);
}

export async function getReviewPasses(sessionId: string): Promise<ReviewPass[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ pass: string }>(`SELECT pass FROM review_passes WHERE session_id = ?`, [sessionId]);
  return rows.map((r) => r.pass as ReviewPass);
}

// Recent drill history for the Progress screen.
export async function getRecentDrillAttempts(limit = 200): Promise<
  { drillType: DrillType; skill: SkillId | null; startedAt: string; score: number | null; success: boolean | null; level: number | null }[]
> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ drill_type: string; skill: string | null; started_at: string; score: number | null; success: number | null; drill_level: number | null }>(
    `SELECT drill_type, skill, started_at, score, success, drill_level FROM drill_attempts ORDER BY started_at DESC LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({
    drillType: r.drill_type as DrillType,
    skill: (r.skill as SkillId | null) ?? null,
    startedAt: r.started_at,
    score: r.score,
    success: r.success == null ? null : r.success === 1,
    level: r.drill_level,
  }));
}

// Conversation drill attempts, oldest first, reduced to what Progress charts.
export async function getConversationAttemptSummaries(limit = 60): Promise<(AttemptSummary & { startedAt: string; drillType: DrillType })[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ drill_type: string; started_at: string; metrics_json: string | null }>(
    `SELECT drill_type, started_at, metrics_json FROM drill_attempts WHERE skill = 'conversation' AND metrics_json IS NOT NULL
     ORDER BY started_at DESC LIMIT ?`,
    [limit],
  );
  return rows.reverse().map((r) => {
    let parsed: unknown = null;
    try {
      parsed = r.metrics_json ? JSON.parse(r.metrics_json) : null;
    } catch {
      parsed = null;
    }
    return { ...summarizeAttempt(parsed), startedAt: r.started_at, drillType: r.drill_type as DrillType };
  });
}

// Every day with any practice — a recorded session, a drill, or a finished
// daily plan — for the streak.
export async function getPracticeDates(): Promise<string[]> {
  const [sessions, drills, plans] = await Promise.all([getCompletedSessionDates(), getDrillCompletionDates(), getPlanCompletionDates()]);
  return [...sessions, ...drills, ...plans.map((d) => `${d}T12:00:00`)];
}
