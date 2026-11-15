import type { SkillId } from "../theme/tokens";
import { getGuided, getLesson, getUnit, LESSONS, type Lesson, type LessonStep } from "../content/lessons";
import { nextLessonInUnit, pickActive } from "./path";
import { CONVERSATION_DRILLS, DRILL_TITLES, type DrillType } from "./drills/drillSpecs";
import { FRAMEWORK_LABELS, type FrameworkId } from "./coach/structureHeuristics";
import { WARM_UPS } from "../content/drillContent";
import { SKILLS } from "./mastery";
import { ACTIVITY_IDS, drillActivityId } from "../content/activities";
import { getGridRow } from "../content/skillGrid";
import { LEAVES, PILLAR_OF_SKILL, STARTING_VALUE, leafCounts, type LeafId } from "./scoring/skillTree";
import { blocksFor, SLOT_ORDER, type BlockShape, type DailyMinutes, type SlotKind } from "./sessionLength";

// Builds today's session (docs/overhaul/PLAN.md, sections 5.3 and 9). The
// minutes a day split into one or two blocks; each block is built from five
// slots:
//   1. Warm up.
//   2. Learn: the current lesson's next steps.
//   3. Drill: aimed at the lowest leaf on your focus, or your last result's
//      "one thing next".
//   4. Record + review: a take and its three passes, as one step.
//   5. Reflect or Moment: a debrief, a rehearsal, Feeling of the week, Rewind
//      or Three things, the first that applies.
// A 15-minute block adds a conversation or a second rep; a second block (20
// and 30 minutes) is Drill, Conversation, Review, Reflect. Each slot gets the
// time budget in sessionLength.ts.
//
// The lesson comes from your path (two units on the go, taking turns), or by
// need without one; when reviews pile up the day goes to them. Deterministic
// for a given day and inputs, so reopening the app shows the same plan.

export type PlanMinutes = DailyMinutes;

// What slot 5 can offer today. Worked out by the caller from events, the
// week's Feeling, and Rewind's timing.
export interface ReflectContext {
  // An event yesterday (up to about 3 days ago) not yet debriefed.
  debrief?: { eventId: string; title: string } | null;
  // An event within 2 days.
  eventSoon?: { eventId: string; title: string; daysAway: number } | null;
  // This week's Feeling of the week isn't done, and it's been a few days.
  feelingDue?: boolean;
  // A day waiting to be told, from Rewind's timing.
  rewind?: { day: "today" | "yesterday"; date: string } | null;
}

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
  // finished) the plan picks a skill by need.
  path?: string[];
  // Positions of the steps already done in each lesson's current go (from the
  // activity log). Steps still to do come first, so a short plan still gets
  // the lesson finished.
  lessonStepsDone?: Record<string, number[]>;
  // Leaf ratings, for the drill slot. Missing leaves sit at the starting value.
  leafRatings?: Partial<Record<LeafId, number>>;
  // Your last result's "one thing next", when it names a drill.
  nextDrill?: DrillType | null;
  reflect?: ReflectContext;
}

export type PlanStepKind = "warmup" | "drill" | "guided" | "rep" | "reflect" | "moment";

export interface PlanStep {
  id: string;
  kind: PlanStepKind;
  // Which of the block's slots it fills, and which block (0 or 1).
  slot: SlotKind;
  block: number;
  title: string;
  detail: string;
  minutes: number;
  lessonStep?: LessonStep;
  // Where lessonStep sits in its lesson's own steps, when it came from there.
  // Logged with the step so the lesson knows exactly which of its steps this
  // was. `lessonId` is set when that lesson isn't the plan's (a review).
  lessonStepIndex?: number;
  lessonId?: string;
  // A reflect or moment step's activity (activities.ts), and the event it's for.
  activityId?: string;
  eventId?: string;
}

// Bumped when the plan's shape changes, so a stored plan nobody has started
// yet is rebuilt (v7: minutes a day, blocks and the five slots).
export const PLAN_VERSION = 7;

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
  // One entry per block, with its minutes.
  blocks: { minutes: number }[];
  // The path unit the lesson belongs to, when the path chose it.
  unitId?: string;
  // Built with a path to follow (even on a review day, which sets no unit).
  followsPath?: boolean;
}

// Confidence and conversation days settle nerves with the calming sigh.
const WARMUP_FOR: Record<SkillId, string> = {
  articulation: "wu_articulators",
  cadence: "wu_resonance",
  impromptu: "wu_articulators",
  confidence: "wu_sigh",
  conversation: "wu_sigh",
};

type DrillStep = Extract<LessonStep, { kind: "drill" }>;
type RepStep = Extract<LessonStep, { kind: "rep" }>;
type LessonDrill = DrillStep["drill"];

// Conversation drills a plan may use (Live, which needs Plus, isn't one).
const CONVERSATION_STEPS = [...CONVERSATION_DRILLS] as LessonDrill[];

const DEFAULT_FRAMEWORKS: FrameworkId[] = ["PREP", "WhatSoWhatNowWhat", "PastPresentFuture", "ListOfThree"];

// Drills a plan can pick for the drill slot: the ones lessons already use, so
// each has content and a runner.
const PLAN_DRILLS: LessonDrill[] = [...new Set(LESSONS.flatMap((l) => l.steps.flatMap((s) => (s.kind === "drill" && s.drill !== "conv_live" ? [s.drill] : []))))];

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

// The path's pick for today: the next lesson in one of the two units on the
// go — the one whose skill wasn't yesterday's focus, so they take turns. Null
// on a review day, or with no path left.
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

function titleOf(step: LessonStep): string {
  switch (step.kind) {
    case "warmup":
      return WARM_UPS.find((x) => x.id === step.warmupId)?.title ?? "Warm-up";
    case "drill":
      return DRILL_TITLES[step.drill];
    case "guided":
      return getGuided(step.guidedId)?.title ?? "Guided exercise";
    case "rep":
      return step.framework ? FRAMEWORK_LABELS[step.framework] : "Impromptu rep";
  }
}

// The counted leaves on the focus skill's pillar that a drill trains, lowest
// first, each with the drills that train it most, best first. Ties go to the
// leaf listed first in the tree.
export function weakestLeaves(focus: SkillId, ratings: Partial<Record<LeafId, number>> = {}): { leaf: LeafId; drills: LessonDrill[] }[] {
  const pillar = PILLAR_OF_SKILL[focus];
  const trainable = (leaf: LeafId, weight: "main" | "partial") =>
    PLAN_DRILLS.filter((d) => getGridRow(drillActivityId(d))?.moves.some((m) => m.leaf === leaf && m.weight === weight && !m.displayOnly));
  const leaves = LEAVES.filter((l) => l.pillarId === pillar && leafCounts(l.id))
    .map((l) => ({ leaf: l.id, rating: ratings[l.id] ?? STARTING_VALUE }))
    .filter((l) => trainable(l.leaf, "main").length + trainable(l.leaf, "partial").length > 0)
    .sort((a, b) => a.rating - b.rating);
  return leaves.map((l) => ({ leaf: l.leaf, drills: [...trainable(l.leaf, "main"), ...trainable(l.leaf, "partial")] }));
}

export function drillsForWeakestLeaf(focus: SkillId, ratings: Partial<Record<LeafId, number>> = {}): { leaf: LeafId; drills: LessonDrill[] } | null {
  return weakestLeaves(focus, ratings)[0] ?? null;
}

// Slot 5's choices for today, in the order section 5.3 gives. Three things is
// always last, so there is always one.
function reflectChoices(ctx: ReflectContext | undefined): Omit<PlanStep, "id" | "slot" | "block" | "minutes">[] {
  const out: Omit<PlanStep, "id" | "slot" | "block" | "minutes">[] = [];
  if (ctx?.debrief) out.push({ kind: "moment", title: "How did it go?", detail: `Debrief ${ctx.debrief.title}`, activityId: ACTIVITY_IDS.eventAfter, eventId: ctx.debrief.eventId });
  if (ctx?.eventSoon) {
    const when = ctx.eventSoon.daysAway <= 0 ? "today" : ctx.eventSoon.daysAway === 1 ? "tomorrow" : `in ${ctx.eventSoon.daysAway} days`;
    out.push({ kind: "rep", title: "Rehearsal rep", detail: `For ${ctx.eventSoon.title}, ${when}`, lessonStep: { kind: "rep", focus: `Rehearse for ${ctx.eventSoon.title}.` }, eventId: ctx.eventSoon.eventId });
  }
  if (ctx?.feelingDue) out.push({ kind: "reflect", title: "Feeling of the week", detail: "One line, read four ways", activityId: ACTIVITY_IDS.feeling });
  if (ctx?.rewind) out.push({ kind: "reflect", title: ctx.rewind.day === "today" ? "Rewind today" : "Rewind yesterday", detail: ctx.rewind.day === "today" ? "Tell the story of your day" : "Tell the story of yesterday", activityId: ACTIVITY_IDS.rewind });
  out.push({ kind: "reflect", title: "Three things", detail: "Three good things, said out loud", activityId: ACTIVITY_IDS.threeThings });
  return out;
}

export function buildDailyPlan(input: PlanInput): DailyPlan {
  const fromPath = choosePathLesson(input);
  const focusSkill = fromPath?.lesson.skill ?? chooseFocusSkill(input);
  const { lesson, isReview } = fromPath ? { lesson: fromPath.lesson, isReview: false } : chooseLesson(focusSkill, input);
  const unitId = fromPath?.unitId;
  const doneInLesson = new Set(input.lessonStepsDone?.[lesson.id] ?? []);
  const open = (st: LessonStep) => !doneInLesson.has(lesson.steps.indexOf(st));
  const openFirst = <T extends LessonStep>(list: T[]) => [...list].sort((a, b) => Number(!open(a)) - Number(!open(b)));
  const conversationDay = focusSkill === "conversation";
  const blocks = blocksFor(input.minutes);

  const steps: PlanStep[] = [];
  const usedDrills = new Set<string>();
  const usedReflect = new Set<string>();
  const fromLesson = (st: LessonStep): Pick<PlanStep, "lessonStep" | "lessonStepIndex"> => {
    const at = lesson.steps.indexOf(st);
    return at >= 0 ? { lessonStep: st, lessonStepIndex: at } : { lessonStep: st };
  };
  const kindOf = (st: LessonStep): PlanStepKind => (st.kind === "warmup" ? "warmup" : st.kind);
  const add = (block: number, slot: SlotKind, minutes: number, step: Omit<PlanStep, "id" | "slot" | "block" | "minutes">) => {
    if (step.lessonStep?.kind === "drill") usedDrills.add(step.lessonStep.drill);
    steps.push({ id: "", slot, block, minutes, ...step });
  };
  const lessonStep = (block: number, slot: SlotKind, minutes: number, st: LessonStep, detail: string) =>
    add(block, slot, minutes, { kind: kindOf(st), title: titleOf(st), detail, ...fromLesson(st) });

  const lessonWarmup = lesson.steps[0]?.kind === "warmup" ? lesson.steps[0] : null;
  const practice = openFirst(lesson.steps.filter((s) => s.kind === "drill" || s.kind === "guided"));
  const reps = openFirst(lesson.steps.filter((s): s is RepStep => s.kind === "rep"));
  const lessonConversation = practice.filter((s): s is DrillStep => s.kind === "drill" && CONVERSATION_STEPS.includes(s.drill));
  let practiceAt = 0;
  let repAt = 0;

  const pickConversation = (): DrillStep => {
    const own = lessonConversation.find((s) => !usedDrills.has(s.drill));
    if (own) return own;
    const offset = hashString(input.date) % CONVERSATION_STEPS.length;
    const rotated = [...CONVERSATION_STEPS.slice(offset), ...CONVERSATION_STEPS.slice(0, offset)];
    return { kind: "drill", drill: rotated.find((d) => !usedDrills.has(d)) ?? rotated[0] };
  };
  const pickFramework = (n: number): FrameworkId => DEFAULT_FRAMEWORKS[(hashString(input.date) + n) % DEFAULT_FRAMEWORKS.length];
  const pickTargetDrill = (): { step: DrillStep; detail: string } | null => {
    const next = PLAN_DRILLS.find((d) => d === input.nextDrill);
    if (next && !usedDrills.has(next)) return { step: { kind: "drill", drill: next }, detail: "Your one thing to try next" };
    // The lowest leaf with a drill not already in today's plan.
    for (const weak of weakestLeaves(focusSkill, input.leafRatings)) {
      const candidates = weak.drills.filter((d) => !usedDrills.has(d));
      if (!candidates.length) continue;
      const name = LEAVES.find((l) => l.id === weak.leaf)?.name ?? "your weakest area";
      return { step: { kind: "drill", drill: candidates[hashString(`${input.date}:${steps.length}`) % candidates.length] }, detail: `For ${name}` };
    }
    return null;
  };
  // Another drill of the focus skill from other lessons, when nothing else fits.
  const spareDrill = (): DrillStep | null => {
    const pool = LESSONS.filter((l) => l.skill === focusSkill && l.id !== lesson.id).flatMap((l) => l.steps.filter((s): s is DrillStep => s.kind === "drill" && s.drill !== "conv_live" && !usedDrills.has(s.drill)));
    return pool.length ? pool[hashString(`${input.date}:spare:${steps.length}`) % pool.length] : null;
  };
  // A second block's review: a due lesson that isn't today's.
  const reviewStep = (): { step: LessonStep; lessonId: string; index: number; title: string } | null => {
    const due = LESSONS.filter((l) => l.id !== lesson.id && isDue(input.lessons[l.id]?.nextReviewAt ?? null, input.date));
    for (const l of due) {
      const index = l.steps.findIndex((s) => (s.kind === "drill" && !usedDrills.has(s.drill) && s.drill !== "conv_live") || s.kind === "guided");
      if (index >= 0) return { step: l.steps[index], lessonId: l.id, index, title: l.title };
    }
    return null;
  };
  const reflectFor = (): Omit<PlanStep, "id" | "slot" | "block" | "minutes"> => {
    const choice = reflectChoices(input.reflect).find((c) => !usedReflect.has(c.activityId ?? c.title)) ?? { kind: "reflect" as const, title: "Talk back", detail: "Answer one harsh thought out loud", activityId: ACTIVITY_IDS.talkBack };
    usedReflect.add(choice.activityId ?? choice.title);
    return choice;
  };

  blocks.forEach((block: BlockShape, b) => {
    for (const slot of SLOT_ORDER) {
      const budget = block.budget[slot];
      if (budget == null) continue;
      switch (slot) {
        case "warmup":
          if (lessonWarmup) lessonStep(b, slot, budget, lessonWarmup, "Get your voice and body ready.");
          else add(b, slot, budget, { kind: "warmup", title: titleOf({ kind: "warmup", warmupId: WARMUP_FOR[focusSkill] }), detail: "Get your voice and body ready.", lessonStep: { kind: "warmup", warmupId: WARMUP_FOR[focusSkill] } });
          break;
        case "learn": {
          // About one lesson step per 2 minutes, at least one. Conversation
          // days keep the lesson's conversation drill for the record slot.
          const take = Math.max(1, Math.round(budget / 2));
          const pool = conversationDay && practice.length > 1 ? practice.filter((s) => !(lessonConversation.includes(s as DrillStep) && open(s))) : practice;
          const chosen = (pool.length ? pool : practice).slice(practiceAt, practiceAt + take);
          practiceAt += chosen.length;
          for (const st of chosen) lessonStep(b, slot, budget / chosen.length, st, "From your lesson");
          if (!chosen.length) {
            const spare = spareDrill();
            if (spare) lessonStep(b, slot, budget, spare, "More of the same skill");
          }
          break;
        }
        case "drill":
        case "review": {
          const review = slot === "review" ? reviewStep() : null;
          if (review) {
            add(b, slot, budget, { kind: kindOf(review.step), title: titleOf(review.step), detail: `Review: ${review.title}`, lessonStep: review.step, lessonStepIndex: review.index, lessonId: review.lessonId });
            break;
          }
          const target = pickTargetDrill();
          if (target) {
            add(b, slot, budget, { kind: "drill", title: titleOf(target.step), detail: target.detail, lessonStep: target.step });
            break;
          }
          const spare = spareDrill();
          if (spare) {
            lessonStep(b, slot, budget, spare, "More of the same skill");
            break;
          }
          // Everything is in the plan already: the weakest leaf's drill again.
          const again = weakestLeaves(focusSkill, input.leafRatings)[0]?.drills[0];
          if (again) add(b, slot, budget, { kind: "drill", title: DRILL_TITLES[again], detail: "Once more", lessonStep: { kind: "drill", drill: again } });
          break;
        }
        case "record": {
          // A conversation day has no video take: a partner drill instead.
          if (conversationDay) {
            const conv = pickConversation();
            lessonStep(b, slot, budget, conv, "Your conversation rep");
            break;
          }
          const own = reps[repAt];
          repAt += own ? 1 : 0;
          const rep: RepStep = own ?? { kind: "rep", framework: pickFramework(0), focus: `Use ${FRAMEWORK_LABELS[pickFramework(0)]}.` };
          add(b, slot, budget, { kind: "rep", title: titleOf(rep), detail: `${rep.focus} Then watch it back.`, ...fromLesson(rep) });
          break;
        }
        case "extra": {
          // "Conversation or second rep": a conversation drill in a second
          // block, on a conversation day, or every other day; otherwise a
          // second rep with a different structure.
          if (block.second || conversationDay || hashString(input.date) % 2 === 0) {
            lessonStep(b, slot, budget, pickConversation(), "Back and forth");
          } else {
            const own = reps[repAt];
            repAt += own ? 1 : 0;
            const framework = pickFramework(1);
            const rep: RepStep = own ?? { kind: "rep", framework, focus: "A second rep, with a different structure." };
            add(b, slot, budget, { kind: "rep", title: titleOf(rep), detail: rep.focus, ...fromLesson(rep) });
          }
          break;
        }
        case "reflect":
          add(b, slot, budget, reflectFor());
          break;
      }
    }
  });

  // Every lesson has to be finishable from Today alone. If none of the
  // lesson's open steps made it in (a conversation lesson's rep, a short plan
  // on a lesson with many steps), the first open one takes the drill slot, or
  // the learn slot when there is no drill slot (it holds only repeats then),
  // so the plan keeps its minutes.
  const openIndexes = lesson.steps.map((_, i) => i).filter((i) => !doneInLesson.has(i));
  const covered = new Set(steps.filter((s) => !s.lessonId).map((s) => s.lessonStepIndex));
  if (openIndexes.length && !openIndexes.some((i) => covered.has(i))) {
    const st = lesson.steps[openIndexes[0]];
    let replace = steps.findIndex((s) => s.block === 0 && s.slot === "drill");
    if (replace < 0) replace = steps.findIndex((s) => s.block === 0 && s.slot === "learn");
    if (replace < 0) replace = steps.findIndex((s) => s.block === 0 && s.slot === "record");
    const slot = replace >= 0 ? steps[replace].slot : "learn";
    const replacement: PlanStep = { id: "", slot, block: 0, minutes: replace >= 0 ? steps[replace].minutes : 1.5, kind: kindOf(st), title: titleOf(st), detail: "From your lesson", ...fromLesson(st) };
    if (replace >= 0) steps[replace] = replacement;
    else steps.push(replacement);
  }

  steps.forEach((s, i) => (s.id = `${i}`));
  return {
    version: PLAN_VERSION,
    date: input.date,
    minutes: input.minutes,
    focusSkill,
    lessonId: lesson.id,
    isReview,
    steps,
    blocks: blocks.map((bl) => ({ minutes: bl.minutes })),
    unitId,
    followsPath: !!input.path?.length,
  };
}

// The steps of one block.
export function blockSteps(plan: DailyPlan, block: number): PlanStep[] {
  return plan.steps.filter((s) => (s.block ?? 0) === block);
}

// The first block with a step not done, or null when the day is done.
export function currentBlock(plan: DailyPlan, done: Set<string>): number | null {
  for (let b = 0; b < (plan.blocks?.length ?? 1); b++) if (blockSteps(plan, b).some((s) => !done.has(s.id))) return b;
  return null;
}

// The next `days` days of plans, simulated — each day's focus counts as
// practiced, and its lesson as done, for the next. For the "your first week"
// preview after the skill check; the real plans are still built day by day.
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
