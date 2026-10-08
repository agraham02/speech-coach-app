import type { SkillId } from "../theme/tokens";
import { getGuided, LESSONS, type Lesson, type LessonStep } from "../content/lessons";
import { DRILL_TITLES } from "./drills/drillSpecs";
import { FRAMEWORK_LABELS, type FrameworkId } from "./coach/structureHeuristics";
import { WARM_UPS } from "../content/drillContent";
import { SKILLS } from "./mastery";

// Builds today's 5–12 minute session: warm-up -> focus drill(s) from the
// next lesson in the focus skill -> one impromptu rep -> quick review.
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
}

export type PlanStepKind = "warmup" | "drill" | "guided" | "rep" | "review";

export interface PlanStep {
  id: string;
  kind: PlanStepKind;
  title: string;
  detail: string;
  minutes: number;
  lessonStep?: LessonStep;
}

export interface DailyPlan {
  date: string;
  minutes: PlanMinutes;
  focusSkill: SkillId;
  lessonId: string;
  isReview: boolean;
  steps: PlanStep[];
}

const WARMUP_FOR: Record<SkillId, string> = {
  articulation: "wu_articulators",
  cadence: "wu_resonance",
  impromptu: "wu_articulators",
  confidence: "wu_breath",
  conversation: "wu_breath",
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

export function buildDailyPlan(input: PlanInput): DailyPlan {
  const focusSkill = chooseFocusSkill(input);
  const { lesson, isReview } = chooseLesson(focusSkill, input);
  const steps: PlanStep[] = [];
  const push = (step: LessonStep) => {
    const d = describeStep(step);
    steps.push({ id: `${steps.length}`, ...d, lessonStep: step });
  };

  // 1. Warm-up (unless the lesson opens with its own).
  const lessonHasWarmup = lesson.steps[0]?.kind === "warmup";
  if (!lessonHasWarmup) push({ kind: "warmup", warmupId: WARMUP_FOR[focusSkill] });

  // 2. Lesson practice (drills / guided), more of it in longer sessions.
  const practice = lesson.steps.filter((s) => s.kind !== "rep");
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
    return { date: input.date, minutes: input.minutes, focusSkill, lessonId: lesson.id, isReview, steps };
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

  return { date: input.date, minutes: input.minutes, focusSkill, lessonId: lesson.id, isReview, steps };
}
