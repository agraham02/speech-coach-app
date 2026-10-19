import type { SkillId } from "../theme/tokens";
import { getGuided, getLesson, getUnit, LESSONS, type Lesson, type LessonStep } from "../content/lessons";
import { nextLessonInUnit, pickActive } from "./path";
import { DRILL_TITLES } from "./drills/drillSpecs";
import { FRAMEWORK_LABELS, type FrameworkId } from "./coach/structureHeuristics";
import { WARM_UPS } from "../content/drillContent";
import { SKILLS } from "./mastery";
import { getLines } from "../content/lines";
import { lineOfTheDay } from "./cadence/lineRep";

// Builds today's 5–12 minute session: warm-up -> line of the day -> focus
// drill(s) from the next lesson on your path -> one impromptu rep -> quick
// review. The path (domain/path.ts) has two units on the go at once, from
// different skills; days alternate between them. When reviews pile up, the
// day goes to them instead. The line of the day (one marked line, read with the marks
// and without) puts cadence in every plan, whatever the focus skill.
// Deterministic for a given day and inputs, so reopening the app shows the
// same plan.

export type PlanMinutes = 5 | 8 | 12;

export interface PlanInput {
  date: string; // YYYY-MM-DD
  minutes: PlanMinutes;
  // 0-100 rating and when the skill was last practiced (ISO) per skill.
  skills: Record<SkillId, { rating: number; lastPracticedAt: string | null }>;
  // Focus skill of previous plans, most recent first.
  recentFocus: SkillId[];
  lessons: Record<string, { done: boolean; nextReviewAt: string | null }>;
  // Extra focus weight per skill from onboarding (domain/profile.ts): what
  // gets in your way, fading over a few weeks; an upcoming event's skills.
  priority?: Partial<Record<SkillId, number>>;
  // Your path's units still to do, in order. Without one (or once it's
  // finished) the plan picks a skill by need, as before paths existed.
  path?: string[];
}

export type PlanStepKind = "warmup" | "line" | "drill" | "guided" | "rep" | "review";

export interface PlanStep {
  id: string;
  kind: PlanStepKind;
  title: string;
  detail: string;
  minutes: number;
  lessonStep?: LessonStep;
}

// Bumped when the plan's shape changes, so a stored plan nobody has started
// yet is rebuilt (v2: line of the day; v3: a lesson's own warm-up no longer
// takes one of its practice slots; v4: lessons come from your path).
export const PLAN_VERSION = 4;

// This many lessons due for review make the day a review day.
export const REVIEW_DAY_DUE = 3;

export interface DailyPlan {
  version?: number;
  date: string;
  minutes: PlanMinutes;
  focusSkill: SkillId;
  lessonId: string;
  isReview: boolean;
  steps: PlanStep[];
  // The path unit the lesson belongs to, when the path chose it.
  unitId?: string;
  // Built with a path to follow (even on a review day, which sets no unit).
  followsPath?: boolean;
}

// Confidence and conversation days settle nerves with the calming sigh: a
// long out-breath, no holds — the lessons teach starting to speak on an
// out-breath, not after holding one.
const WARMUP_FOR: Record<SkillId, string> = {
  articulation: "wu_articulators",
  cadence: "wu_resonance",
  impromptu: "wu_articulators",
  confidence: "wu_sigh",
  conversation: "wu_sigh",
};

// A conversation day ends on a conversation drill, not a monologue rep —
// the first of these the day's practice doesn't already include.
const CONVERSATION_APPLY: Extract<LessonStep, { kind: "drill" }>["drill"][] = ["conv_thread", "conv_echo", "conv_reply"];

const DEFAULT_FRAMEWORKS: FrameworkId[] = ["PREP", "WhatSoWhatNowWhat", "PastPresentFuture", "ListOfThree"];

export function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function daysBetween(fromIso: string | null, toDate: string): number {
  if (!fromIso) return 30;
  const ms = Date.parse(`${toDate}T12:00:00`) - Date.parse(fromIso);
  return Math.max(0, ms / 86_400_000);
}

export function chooseFocusSkill(input: PlanInput): SkillId {
  const blocked = input.recentFocus.length >= 2 && input.recentFocus[0] === input.recentFocus[1] ? input.recentFocus[0] : null;
  let best: { skill: SkillId; weight: number } | null = null;
  for (const skill of SKILLS) {
    if (skill === blocked) continue;
    const s = input.skills[skill] ?? { rating: 25, lastPracticedAt: null };
    const due = LESSONS.some((l) => l.skill === skill && isDue(input.lessons[l.id]?.nextReviewAt ?? null, input.date));
    const weight =
      0.5 * (1 - s.rating / 100) +
      0.3 * (Math.min(daysBetween(s.lastPracticedAt, input.date), 7) / 7) +
      0.2 * (due ? 1 : 0) +
      (input.priority?.[skill] ?? 0) +
      // tiny deterministic tie-breaker
      (hashString(`${input.date}:${skill}`) % 100) / 10_000;
    if (!best || weight > best.weight) best = { skill, weight };
  }
  return best!.skill;
}

function isDue(nextReviewAt: string | null, date: string): boolean {
  return !!nextReviewAt && nextReviewAt.slice(0, 10) <= date;
}

export function chooseLesson(skill: SkillId, input: PlanInput): { lesson: Lesson; isReview: boolean } {
  const track = LESSONS.filter((l) => l.skill === skill);
  const due = track.find((l) => isDue(input.lessons[l.id]?.nextReviewAt ?? null, input.date));
  const next = track.find((l) => !input.lessons[l.id]?.done);
  if (next && !due) return { lesson: next, isReview: false };
  if (due) return { lesson: due, isReview: true };
  if (next) return { lesson: next, isReview: false };
  // Track finished and nothing due: rotate through it for practice.
  return { lesson: track[hashString(input.date) % track.length], isReview: true };
}

function describeStep(step: LessonStep): { kind: PlanStepKind; title: string; detail: string; minutes: number } {
  switch (step.kind) {
    case "warmup": {
      const w = WARM_UPS.find((x) => x.id === step.warmupId);
      return { kind: "warmup", title: w?.title ?? "Warm-up", detail: "Get your voice and body ready.", minutes: 1 };
    }
    case "drill":
      return { kind: "drill", title: DRILL_TITLES[step.drill], detail: "Focus drill", minutes: 2 };
    case "guided":
      return { kind: "guided", title: getGuided(step.guidedId)?.title ?? "Guided exercise", detail: "Follow the steps, then rate yourself.", minutes: 2 };
    case "rep":
      return {
        kind: "rep",
        title: step.framework ? FRAMEWORK_LABELS[step.framework] : "Impromptu rep",
        detail: step.focus,
        minutes: 2,
      };
  }
}

// The path's pick for today: the next lesson in one of the two units on
// the go — the one whose skill wasn't yesterday's focus, so they take turns.
// Null on a review day, or with no path left.
export function choosePathLesson(input: PlanInput): { lesson: Lesson; unitId: string } | null {
  if (!input.path?.length) return null;
  const due = LESSONS.filter((l) => isDue(input.lessons[l.id]?.nextReviewAt ?? null, input.date)).length;
  if (due >= REVIEW_DAY_DUE) return null;
  const open = input.path.filter((id) => nextLessonInUnit(id, input.lessons) != null);
  const active = pickActive(open);
  if (!active.length) return null;
  const unitId = active.find((id) => getUnit(id)?.skill !== input.recentFocus[0]) ?? active[0];
  const lesson = getLesson(nextLessonInUnit(unitId, input.lessons)!);
  return lesson ? { lesson, unitId } : null;
}

export function buildDailyPlan(input: PlanInput): DailyPlan {
  const fromPath = choosePathLesson(input);
  const focusSkill = fromPath?.lesson.skill ?? chooseFocusSkill(input);
  const { lesson, isReview } = fromPath ? { lesson: fromPath.lesson, isReview: false } : chooseLesson(focusSkill, input);
  const unitId = fromPath?.unitId;
  const steps: PlanStep[] = [];
  const push = (step: LessonStep) => {
    const d = describeStep(step);
    steps.push({ id: `${steps.length}`, ...d, lessonStep: step });
  };

  // 1. Warm-up — the lesson's own if it opens with one — then the line of
  // the day. A 5-minute plan swaps the generic warm-up for the line, so it
  // stays at 5 minutes; if the lesson brings its own warm-up, a 5-minute
  // plan skips the line. Either way the warm-up never takes a practice slot
  // below — otherwise a short plan would mark "Breathe low" done without
  // ever reaching its drill.
  const lessonHasWarmup = lesson.steps[0]?.kind === "warmup";
  if (lessonHasWarmup) push(lesson.steps[0]);
  else if (input.minutes !== 5) push({ kind: "warmup", warmupId: WARMUP_FOR[focusSkill] });
  if (!lessonHasWarmup || input.minutes !== 5) {
    const line = lineOfTheDay(getLines(), input.date, hashString);
    steps.push({
      id: `${steps.length}`,
      kind: "line",
      title: "Line of the day",
      detail: line.text,
      minutes: 1,
      lessonStep: { kind: "drill", drill: "marked_reading", contentId: line.id },
    });
  }

  // 2. Lesson practice (drills / guided), more of it in longer sessions.
  const practice = lesson.steps.filter((s) => s.kind !== "rep" && s.kind !== "warmup");
  const practiceCount = input.minutes === 5 ? 1 : input.minutes === 8 ? 2 : practice.length;
  practice.slice(0, Math.max(1, practiceCount)).forEach(push);

  // 3. One apply step. Conversation: a partner drill. Otherwise one
  // impromptu rep: the lesson's own, or a framework rep.
  const lessonRep = lesson.steps.find((s): s is Extract<LessonStep, { kind: "rep" }> => s.kind === "rep");
  if (focusSkill === "conversation") {
    // The lesson's own drill comes first — a short plan may have kept only
    // its guided step, and finishing the plan marks the lesson done.
    const used = new Set(steps.map((s) => (s.lessonStep?.kind === "drill" ? s.lessonStep.drill : null)));
    const lessonDrill = practice.find((s): s is Extract<LessonStep, { kind: "drill" }> => s.kind === "drill" && !used.has(s.drill));
    push(lessonDrill ?? { kind: "drill", drill: CONVERSATION_APPLY.find((d) => !used.has(d)) ?? "conv_reply" });
    // No video rep to review on a conversation day.
    return { version: PLAN_VERSION, date: input.date, minutes: input.minutes, focusSkill, lessonId: lesson.id, isReview, steps, unitId, followsPath: !!input.path?.length };
  }
  if (lessonRep) {
    push(lessonRep);
  } else {
    const framework = DEFAULT_FRAMEWORKS[hashString(input.date) % DEFAULT_FRAMEWORKS.length];
    push({ kind: "rep", framework, focus: `Use ${FRAMEWORK_LABELS[framework]}.` });
  }

  // 4. Quick review of today's rep (the three-pass method).
  if (input.minutes >= 8) {
    steps.push({ id: `${steps.length}`, kind: "review", title: "Quick review", detail: "Watch, listen, then both — at 1.5×.", minutes: 1 });
  }

  return { version: PLAN_VERSION, date: input.date, minutes: input.minutes, focusSkill, lessonId: lesson.id, isReview, steps, unitId, followsPath: !!input.path?.length };
}

// The next `days` days of plans, simulated — each day's focus counts as
// practiced, and its lesson as done, for the next. For the "your first week" preview after the
// skill check; the real plans are still built day by day.
export function previewPlans(input: PlanInput, days: number): DailyPlan[] {
  const skills = { ...input.skills };
  const lessons = { ...input.lessons };
  const recent = [...input.recentFocus];
  const out: DailyPlan[] = [];
  const start = new Date(`${input.date}T12:00:00`);
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const plan = buildDailyPlan({ ...input, date, skills, lessons, recentFocus: [...recent] });
    out.push(plan);
    recent.unshift(plan.focusSkill);
    // Finishing the day's plan finishes its lesson, so the next one comes up.
    lessons[plan.lessonId] = { done: true, nextReviewAt: null };
    skills[plan.focusSkill] = { rating: skills[plan.focusSkill].rating + 4, lastPracticedAt: `${date}T12:00:00` };
  }
  return out;
}
