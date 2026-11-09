import { getDatabase } from "./database";
import { getCompletedSessionDates } from "./statsRepo";
import { getDrillCompletionDates } from "./drillsRepo";
import { getRewindDates } from "./rewindRepo";
import { generateId } from "../../utils/generateId";
import { isoDateFromDate, todayISODate } from "../../utils/dateUtils";
import { buildTopUpPlan } from "../../domain/dailyGoal";
import { priorityFor } from "../../domain/profile";
import { getNextEvent, getReminderSettings, getUserProfile, setTakeLevel } from "../prefs/prefsStore";
import { computeStreakState, type StreakState } from "../../domain/streaks";
import type { SkillId } from "../../theme/tokens";
import { DRILL_SKILL, DRILL_TITLES, type DrillOutcome, type DrillType } from "../../domain/drills/drillSpecs";
import { MIN_LEVEL, SKILLS, nextDifficulty, nextReviewIntervalDays, type SkillRating } from "../../domain/mastery";
import type { Stage } from "../../domain/levels";
import { drillSource, type AttemptEvidence, type LeafEvidence } from "../../domain/scoring/leafEvidence";
import { PILLAR_OF_SKILL, STARTING_VALUE, getLeaf, skillOfPillar, type LeafId, type PillarId } from "../../domain/scoring/skillTree";
import type { Trail } from "../../domain/scoring/rollup";
import { activityOfDrill } from "../../content/activities";
import { SKILL_CHECK_LEAVES, type EvidenceSource } from "../../content/skillGrid";
import type { GateVerdict } from "../../domain/gates";
import { emitStageEarned } from "../progress/progressEvents";
import { chooseLevel, mainLeafOf } from "../../domain/difficulty/choose";
import { getAttemptsFor, getAttemptsSince, getLeafRatings, getNodeStages, getPillarProgress, getTreeScores, recordAttempt, seedLeaves, type AttemptResult } from "./leafRepo";
import { getPathOrder } from "./pathRepo";
import { isSessionLive } from "./sessionsRepo";
import { getPracticeMarkerDates } from "./practiceDaysRepo";
import { buildDailyPlan, PLAN_VERSION, type DailyPlan, type PlanMinutes } from "../../domain/dailyPlan";
import { doneStepsByPlan, lessonProgress, wantedByPlanStep } from "../../domain/activityLog";
import { getEntriesForLesson, getEntriesOn, getLessonStepsDone, logActivity } from "./activityLogRepo";
import { getLesson } from "../../content/lessons";
import { summarizeAttempt, type AttemptSummary } from "../../domain/conversation/attemptMetrics";

// Curriculum v2 persistence: skill mastery, adaptive drill difficulty,
// lesson progress, daily plans and review passes.

export interface SkillState extends SkillRating {
  lastPracticedAt: string | null;
  // The stage earned in this skill (domain/levels.ts) — it never drops.
  stage: Stage;
  stageReachedAt: string | null;
  // Good attempts at each proof difficulty or harder.
  goodAt: Partial<Record<number, number>>;
}

// The five skills the screens still group by. Each is its pillar's score now
// (skillTree.ts, PILLAR_OF_SKILL): worked out, not stored.
export async function getSkillStates(): Promise<Record<SkillId, SkillState>> {
  const [scores, progress, stages] = await Promise.all([getTreeScores(), getPillarProgress(), getNodeStages()]);
  const out = {} as Record<SkillId, SkillState>;
  for (const skill of SKILLS) {
    const pillar = PILLAR_OF_SKILL[skill];
    const p = progress.get(pillar);
    const stage = stages.get(pillar);
    out[skill] = {
      rating: Math.round((scores.pillars[pillar] ?? STARTING_VALUE) * 10) / 10,
      attempts: p?.attempts ?? 0,
      lastPracticedAt: p?.lastAt ?? null,
      stage: stage?.stage ?? 1,
      stageReachedAt: stage?.reachedAt ?? null,
      goodAt: p?.goodAt ?? {},
    };
  }
  return out;
}

// Starting values from the onboarding skill check. Each old skill's rating goes
// on the leaves of its pillar that the check touched, and only where there's no
// practice yet: real attempts always outrank a five-minute sample.
export async function seedSkillRatings(ratings: Partial<Record<SkillId, number | null>>, label = "Skill check"): Promise<void> {
  const seeds: Partial<Record<LeafId, number>> = {};
  for (const skill of SKILLS) {
    const rating = ratings[skill];
    if (rating == null) continue;
    for (const leaf of SKILL_CHECK_LEAVES) if (getLeaf(leaf).pillarId === PILLAR_OF_SKILL[skill]) seeds[leaf] = rating;
  }
  await seedLeaves(seeds, label);
}

// --- What moved each rating ------------------------------------------------

export type SkillEventSource = "drill" | "rep" | "seed";

export interface SkillEvent {
  id: string;
  skill: SkillId;
  at: string;
  ratingBefore: number;
  ratingAfter: number;
  source: SkillEventSource;
  label: string;
  // 0-1 result, and the difficulty it was at.
  score: number | null;
  level: number | null;
  sessionId: string | null;
  drillType: DrillType | null;
}

// The attempts that moved a skill's pillar, newest first.
export async function getSkillEvents(skill: SkillId, limit = 40): Promise<SkillEvent[]> {
  const pillar = PILLAR_OF_SKILL[skill];
  const attempts = await getAttemptsFor("pillar_id", pillar, limit);
  return attempts.map((a) => {
    const [before, after] = a.nodes[pillar] ?? [STARTING_VALUE, STARTING_VALUE];
    return {
      id: a.id,
      skill,
      at: a.at,
      ratingBefore: before,
      ratingAfter: after,
      source: a.kind,
      label: a.label,
      score: a.score,
      level: a.difficulty,
      sessionId: a.sessionId,
      drillType: (a.drillType as DrillType | null) ?? null,
    };
  });
}

// How each skill's rating moved since a moment (practice only, not the
// skill check's placement): where it started and where it is now.
export async function getSkillMovesSince(sinceIso: string): Promise<{ skill: SkillId; from: number; to: number }[]> {
  const moves = new Map<SkillId, { skill: SkillId; from: number; to: number }>();
  for (const attempt of await getAttemptsSince(sinceIso)) {
    for (const skill of SKILLS) {
      const node = attempt.nodes[PILLAR_OF_SKILL[skill]];
      if (!node) continue;
      const m = moves.get(skill);
      if (m) m.to = node[1];
      else moves.set(skill, { skill, from: node[0], to: node[1] });
    }
  }
  return [...moves.values()];
}

// Misses in a row per drill this launch: three ease the stage floor by 1 (6.7, rule 6).
const missesInARow = new Map<string, number>();

// The difficulty this drill runs at now: its staircase, started from your skill
// the first time, pulled back if it drifts from it, and never under the floor
// your stage on its leaf has earned (domain/difficulty/choose.ts).
export async function getDrillLevel(type: DrillType, contentId?: string): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ level: number }>(`SELECT level FROM drill_difficulty WHERE drill_type = ?`, [type]);
  const leaf = mainLeafOf(activityOfDrill(type, contentId));
  let leafRating: number | null = null;
  let leafStage: Stage | null = null;
  if (leaf) {
    const [ratings, stages] = await Promise.all([getLeafRatings(), getNodeStages()]);
    leafRating = ratings[leaf]?.rating ?? STARTING_VALUE;
    leafStage = stages.get(leaf)?.stage ?? null;
  } else if (type === "rep") {
    // A take moves many leaves: it follows Overall.
    leafRating = (await getTreeScores()).overall;
  }
  return chooseLevel({ stored: row?.level ?? null, leafRating, leafStage, missesInARow: missesInARow.get(type) ?? 0 });
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
  if (type === "rep") setTakeLevel(level);
}

export interface ProgressChange {
  skill: SkillId;
  ratingBefore: number;
  ratingAfter: number;
  levelBefore: number;
  levelAfter: number;
  // Crossed into a new whole difficulty level — worth celebrating.
  leveledUp: boolean;
  // The skill's stage, and the speaker level built from every stage
  // (domain/levels.ts). Optional: progress saved before levels existed
  // doesn't have them.
  stageBefore?: Stage;
  stageAfter?: Stage;
  stagedUp?: boolean;
  speakerLevelBefore?: number;
  speakerLevelAfter?: number;
  // What the attempt did, from a leaf up to Overall (plan 6.3).
  trail?: Trail | null;
}

// The old skill an attempt mainly belongs to: the pillar of its biggest move, or
// the one the screen asked for when that's Composure, which has no old skill.
function mainSkill(result: AttemptResult, fallback: SkillId): SkillId {
  const top = result.trail?.path[0]?.id as LeafId | undefined;
  return (top ? skillOfPillar(getLeaf(top).pillarId) : null) ?? fallback;
}

function pillarStage(result: AttemptResult, pillar: PillarId, stageOf: (id: string) => Stage): { before: Stage; after: Stage } {
  const up = result.stageUps.find((s) => s.nodeId === pillar);
  return up ? { before: up.stageBefore, after: up.stageAfter } : { before: stageOf(pillar), after: stageOf(pillar) };
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
  // A skill-check sample: the attempt is kept, but no leaf moves and no attempt
  // counts: seedSkillRatings places them (domain/practice.ts).
  placement?: boolean;
  // The catalogue's id, when the drill type alone doesn't say (a guided exercise).
  activityId?: string;
  // Who checked it. Defaults by drill type (domain/scoring/leafEvidence.ts).
  source?: EvidenceSource;
  // A number per leaf, when one number doesn't fit the whole row.
  leafScores?: Partial<Record<LeafId, LeafEvidence>>;
  // Failed: the attempt is kept, but it has no score, moves no leaf and doesn't
  // step the difficulty (plan 6.4, rule 2).
  gate?: GateVerdict;
  // Scored from the live recognizer, not Whisper's reading of the clip: counts light.
  quick?: boolean;
}): Promise<ProgressChange> {
  const gated = args.gate?.passed === false;
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
      gated ? null : args.outcome.score,
      !gated && args.outcome.success ? 1 : 0,
    ],
  );
  const levelAfter = gated ? args.level : nextDifficulty(args.level, args.outcome.success);
  if (!gated && !args.placement) missesInARow.set(args.drillType, args.outcome.success ? 0 : (missesInARow.get(args.drillType) ?? 0) + 1);
  if (!gated) await saveDrillLevel(args.drillType, levelAfter, args.outcome.success);

  const stages = await getNodeStages();
  const stageOf = (id: string): Stage => stages.get(id)?.stage ?? 1;
  const result = await recordAttempt({
    evidence: {
      activityId: args.activityId ?? activityOfDrill(args.drillType, args.contentId),
      score: args.placement || gated ? null : args.outcome.score,
      leafScores: args.placement || gated ? {} : args.leafScores,
      difficulty: args.level,
      source: args.source ?? drillSource(args.drillType),
      ...(args.quick ? { quick: true } : {}),
    },
    label: DRILL_TITLES[args.drillType] ?? "Drill",
    kind: "drill",
    drillType: args.drillType,
  });
  const main = mainSkill(result, skill);
  const pillar = PILLAR_OF_SKILL[main];
  const stage = pillarStage(result, pillar, stageOf);
  for (const up of result.stageUps) {
    const staged = skillOfPillar(up.nodeId as PillarId);
    if (staged) emitStageEarned({ skill: staged, stage: up.stageAfter, speakerLevel: result.levelAfter > result.levelBefore ? result.levelAfter : null });
  }
  return {
    skill: main,
    ratingBefore: result.before.pillars[pillar] ?? STARTING_VALUE,
    ratingAfter: result.after.pillars[pillar] ?? STARTING_VALUE,
    levelBefore: args.level,
    levelAfter,
    leveledUp: Math.floor(levelAfter) > Math.floor(args.level),
    stageBefore: stage.before,
    stageAfter: stage.after,
    stagedUp: stage.after > stage.before,
    speakerLevelBefore: result.levelBefore,
    speakerLevelAfter: result.levelAfter,
    trail: result.trail,
  };
}

// One recorded take: a number per leaf it can show, each moving that leaf by the
// grid (domain/scoring/takeLeaves.ts). This is how real speaking moves the tree.
export async function recordTakeOutcome(
  evidence: Omit<AttemptEvidence, "difficulty">,
  // difficulty: what this take was (its prompt, prep and length; difficulty/scale.ts).
  context: { sessionId: string; label: string; meanScore: number | null; difficulty?: number },
): Promise<ProgressChange[]> {
  // A take deleted while it was still being analysed moves nothing.
  if (!(await isSessionLive(context.sessionId))) return [];
  // One take moves the tree once, even if it's settled twice.
  const db = await getDatabase();
  if (await db.getFirstAsync(`SELECT 1 FROM score_attempts WHERE session_id = ? LIMIT 1`, [context.sessionId])) return [];
  const repLevel = await getDrillLevel("rep");
  const level = context.difficulty ?? repLevel;
  const stages = await getNodeStages();
  const stageOf = (id: string): Stage => stages.get(id)?.stage ?? 1;
  const result = await recordAttempt({ evidence: { ...evidence, difficulty: level }, label: context.label, kind: "rep", sessionId: context.sessionId, drillType: "rep" });
  if (!result.moves.length) return [];
  const success = (context.meanScore ?? 0) >= 0.7;
  // The staircase that sets up your next take steps from where it was.
  const levelAfter = nextDifficulty(repLevel, success);
  await saveDrillLevel("rep", levelAfter, success);
  const moved = (result.trail?.pillars ?? []).filter((p) => skillOfPillar(p.id as PillarId));
  return moved.map((p) => {
    const stage = pillarStage(result, p.id as PillarId, stageOf);
    return {
      skill: skillOfPillar(p.id as PillarId)!,
      ratingBefore: p.before,
      ratingAfter: p.after,
      levelBefore: level,
      levelAfter,
      leveledUp: Math.floor(levelAfter) > Math.floor(level),
      stageBefore: stage.before,
      stageAfter: stage.after,
      stagedUp: stage.after > stage.before,
      speakerLevelBefore: result.levelBefore,
      speakerLevelAfter: result.levelAfter,
      trail: result.trail,
    };
  });
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

// The steps of a lesson done in the current go at it (since it was last
// completed), from the activity log. They carry over between days and from
// wherever the steps were done: the lesson, a plan or Practice.
export async function getLessonStepsState(lessonId: string): Promise<Set<number>> {
  const [entries, states] = await Promise.all([getEntriesForLesson(lessonId), getLessonStates()]);
  return lessonProgress(lessonId, entries, states[lessonId]?.completedAt ?? null).done;
}

// score is the real average of the lesson's scored steps, or null when none
// was scored (then the lesson counts as passed: every step was done).
export async function completeLesson(lessonId: string, score: number | null, success: boolean): Promise<void> {
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

// Which steps of a stored plan are done is not stored with it: it is worked
// out from the activity log (domain/activityLog.ts), so a step done anywhere
// ticks everywhere. Only when the plan finishes is that remembered (completed_at),
// because streaks and the path read it.
async function readStored(date: string, slot: number): Promise<StoredPlan | null> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ slot: number; plan_json: string; completed_at: string | null }>(
    `SELECT 0 AS slot, plan_json, completed_at FROM daily_plans WHERE date = ?
     UNION ALL SELECT slot, plan_json, completed_at FROM daily_topups WHERE date = ?`,
    [date, date],
  );
  const mine = rows.find((r) => r.slot === slot);
  if (!mine) return null;
  const plans = rows.map((r) => ({ date, slot: r.slot, steps: (JSON.parse(r.plan_json) as DailyPlan).steps }));
  const done = doneStepsByPlan(plans, await getEntriesOn(date))[slot] ?? new Set<string>();
  const plan = JSON.parse(mine.plan_json) as DailyPlan;
  const completedStepIds = plan.steps.filter((st) => done.has(st.id)).map((st) => st.id);
  const allDone = plan.steps.length > 0 && completedStepIds.length === plan.steps.length;
  let completedAt = mine.completed_at;
  if (allDone && !completedAt) {
    completedAt = new Date().toISOString();
    if (slot === 0) await db.runAsync(`UPDATE daily_plans SET completed_at = ? WHERE date = ?`, [completedAt, date]);
    else await db.runAsync(`UPDATE daily_topups SET completed_at = ? WHERE date = ? AND slot = ?`, [completedAt, date, slot]);
  }
  return { plan, completedStepIds, completedAt };
}

const readPlan = (date: string) => readStored(date, 0);
const readTopUp = (date: string, slot: number) => readStored(date, slot);

async function planWorkedOn(date: string): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM activity_log WHERE plan_date = ? AND COALESCE(plan_slot, 0) = 0`, [date]);
  return (row?.n ?? 0) > 0;
}

// After something was logged: the day's plans may now be finished.
export async function refreshPlanCompletion(date: string): Promise<void> {
  for (const slot of [0, 1, 2]) await readStored(date, slot);
}

// Today's plan — generated once per day and stored, so it can be resumed.
// `regenerate` swaps it (only allowed before any step is done).
export async function getTodaysPlan(minutes: PlanMinutes, regenerate = false): Promise<StoredPlan> {
  const date = todayISODate();
  const [existing, path] = await Promise.all([readPlan(date), getPathOrder().catch(() => [] as string[])]);
  const outdated = existing && (existing.plan.version ?? 1) < PLAN_VERSION;
  // A plan made before your path was built doesn't follow it; until it's
  // started, it's remade.
  const pathless = existing && !existing.plan.followsPath && path.length > 0;
  if (existing && !regenerate && !outdated && !pathless && existing.plan.minutes === minutes) return existing;
  // Once the plan itself has been worked on (a step done from it, or skipped)
  // it is kept. A drill done from Practice earlier in the day ticks the plan
  // but doesn't freeze it, so changing the minutes still rebuilds it.
  if (existing && (await planWorkedOn(date))) return existing;

  const db = await getDatabase();
  const [skills, lessons, recent, lessonStepsDone] = await Promise.all([
    getSkillStates(),
    getLessonStates(),
    db.getAllAsync<{ plan_json: string }>(`SELECT plan_json FROM daily_plans WHERE date < ? ORDER BY date DESC LIMIT 2`, [date]),
    getLessonStepsDone(),
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
    priority: priorityFor(getUserProfile(), date, getNextEvent()),
    path,
    lessonStepsDone,
  });
  await db.runAsync(`INSERT OR REPLACE INTO daily_plans (date, plan_json, completed_at) VALUES (?, ?, NULL)`, [date, JSON.stringify(plan)]);
  // Anything already done today (from Practice, say) ticks the new plan at once.
  return (await readPlan(date)) ?? { plan, completedStepIds: [], completedAt: null };
}

// Skipping a step counts it done for this plan only. It is logged as a skip,
// not as the activity, so nothing else ticks and no lesson step is satisfied.
export async function skipPlanStep(date: string, slot: number, stepId: string): Promise<StoredPlan | null> {
  const stored = await readStored(date, slot);
  const step = stored?.plan.steps.find((st) => st.id === stepId);
  if (!stored || !step) return stored;
  const wanted = wantedByPlanStep(step);
  await logActivity({
    activityId: wanted?.activityId ?? "review:take",
    variant: wanted?.variant ?? null,
    outcome: "skipped",
    planDate: date,
    planSlot: slot || null,
    planStepId: stepId,
  });
  return readStored(date, slot);
}

// ---------------------------------------------------------------------------
// Daily goal: top-up sessions (2 and 3)
// ---------------------------------------------------------------------------

// Today's top-up for a slot — built once on a skill today hasn't touched yet,
// then stored so it can be resumed.
export async function getTopUpPlan(slot: 1 | 2, options: { quiet?: boolean } = {}): Promise<StoredPlan> {
  const date = todayISODate();
  const existing = await readTopUp(date, slot);
  if (existing) return existing;
  const [main, other, skills, lessons, lessonStepsDone] = await Promise.all([readPlan(date), readTopUp(date, slot === 1 ? 2 : 1), getSkillStates(), getLessonStates(), getLessonStepsDone()]);
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
    lessonStepsDone,
  });
  const db = await getDatabase();
  await db.runAsync(`INSERT OR REPLACE INTO daily_topups (date, slot, plan_json, completed_at) VALUES (?, ?, ?, NULL)`, [date, slot, JSON.stringify(plan)]);
  return (await readTopUp(date, slot)) ?? { plan, completedStepIds: [], completedAt: null };
}

// Which top-up slots are finished today.
export async function getCompletedTopUpSlots(date = todayISODate()): Promise<number[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ slot: number }>(`SELECT slot FROM daily_topups WHERE date = ? AND completed_at IS NOT NULL`, [date]);
  return rows.map((r) => r.slot);
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
// daily plan — for the streak. A day whose takes were all deleted still counts
// (the bare date marker a delete leaves; nothing else about the take does).
export async function getPracticeDates(): Promise<string[]> {
  const [sessions, drills, plans, markers] = await Promise.all([
    getCompletedSessionDates(),
    getDrillCompletionDates(),
    getPlanCompletionDates(),
    getPracticeMarkerDates(),
  ]);
  return [...sessions, ...drills, ...plans.map((d) => `${d}T12:00:00`), ...markers.map((d) => `${d}T12:00:00`)];
}

// Every day that counts toward the streak. Kept apart from getPracticeDates,
// which also decides whether today's session is done.
export async function getStreakDates(): Promise<string[]> {
  const [practice, rewinds] = await Promise.all([getPracticeDates(), getRewindDates()]);
  return [...practice, ...rewinds];
}

// The one streak every screen shows — practice of any kind, rest days left
// out, and freezes covering a missed day (see domain/streaks.ts).
export async function getStreakState(): Promise<StreakState> {
  return computeStreakState(await getStreakDates(), new Date(), getReminderSettings().practiceDays);
}
