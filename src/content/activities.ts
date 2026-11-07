import { GUIDED, LESSONS, type LessonStep } from "./lessons";
import { WARM_UPS } from "./drillContent";
import { CONVERSATION_DRILLS, DRILL_SKILL, DRILL_TITLES, type DrillType } from "../domain/drills/drillSpecs";
import type { SkillId } from "../theme/tokens";

// The one catalogue of activities (docs/overhaul/PLAN.md, section 5.1). It
// wraps the definitions that already exist (drills, guided exercises,
// warm-ups, lessons) and the activities that are screens rather than content
// (speak modes, reflect tools, moments, the skill check), and gives each one
// a stable id. That id is what the activity log stores, so a check mark
// anywhere (the plan, a lesson, Practice) is a query over the log rather than
// a flag each screen keeps for itself.
//
// Gates and the scoring grid are keyed by these ids too. Each entry's `gate`
// and `number` stay empty until phase 3b and 3a fill them in (plan section 7).

export type ActivityKind = "lesson" | "checkpoint" | "drill" | "speak" | "conversation" | "reflect" | "moment" | "check";

// How often an activity can be done, from the plan's table in 5.1.
export type Repeats =
  | "always" // as often as you like; difficulty adapts
  | "once-then-reviews" // a lesson: once, then spaced reviews
  | "once-per-unit" // a checkpoint; it can be retried or skipped for now
  | "once-per-event" // a moment
  | "monthly"; // the skill check: day 1, then every 30 days

// Where an activity can show up.
export type Appears = "plan" | "lesson" | "practice" | "path";

export interface Activity {
  id: string;
  kind: ActivityKind;
  title: string;
  minutes: number;
  repeats: Repeats;
  appears: Appears[];
  // The skill (old five) it trains, where it has one. The tree replaces this
  // in phase 3a.
  skill?: SkillId;
  // Filled in by phase 3b (the gate) and 3a (the number).
  gate?: string;
  number?: string;
}

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

export const ACTIVITY_IDS = {
  // Takes.
  impromptu: "speak:impromptu",
  concise: "speak:concise",
  freeRecord: "speak:free",
  script: "speak:script",
  // A plan's quick review of a take (three passes).
  review: "review:take",
  skillCheck: "check:skill",
  // Reflect.
  rewind: "reflect:rewind",
  feeling: "reflect:feeling",
  threeThings: "reflect:three_things",
  talkBack: "reflect:talk_back",
  phrasebook: "reflect:phrasebook",
  // Moments.
  prime: "moment:prime",
  debrief: "moment:debrief",
  eventBefore: "moment:before",
  eventAfter: "moment:after",
} as const;

export const lessonActivityId = (lessonId: string) => `lesson:${lessonId}`;
export const warmupActivityId = (warmupId: string) => `warmup:${warmupId}`;
export const guidedActivityId = (guidedId: string) => `guided:${guidedId}`;

const CONVERSATION_SET = new Set<string>([...CONVERSATION_DRILLS, "conv_live"]);

// "drill:twister", "conversation:conv_reply". Content (which twister, which
// line) isn't part of the id: doing any twister is doing the twister drill.
export function drillActivityId(drill: DrillType): string {
  return CONVERSATION_SET.has(drill) ? `conversation:${drill}` : `drill:${drill}`;
}

// The activity a lesson step (or a plan step built from one) asks for.
export function activityIdOfStep(step: LessonStep): string {
  switch (step.kind) {
    case "warmup":
      return warmupActivityId(step.warmupId);
    case "guided":
      return guidedActivityId(step.guidedId);
    case "drill":
      return drillActivityId(step.drill);
    case "rep":
      return ACTIVITY_IDS.impromptu;
  }
}

// What a step needs besides the activity: a rep that names a structure is
// only met by a rep in that structure. Everything else has no variant.
export function variantOfStep(step: LessonStep): string | null {
  return step.kind === "rep" && step.framework && step.framework !== "None" ? step.framework : null;
}

// Does a logged activity satisfy a step that asks for `wanted`? The ids must
// match; a variant, if the step asks for one, must match too. A step with no
// variant takes any.
export function activitySatisfies(logged: { activityId: string; variant: string | null }, wanted: { activityId: string; variant: string | null }): boolean {
  if (logged.activityId !== wanted.activityId) return false;
  return wanted.variant == null || logged.variant === wanted.variant;
}

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

const INDEPENDENT_DRILLS = (Object.keys(DRILL_TITLES) as DrillType[]).filter((d) => d !== "guided" && d !== "warmup" && d !== "rep" && !CONVERSATION_SET.has(d));

const SPEAK: Activity[] = [
  { id: ACTIVITY_IDS.impromptu, kind: "speak", title: "Impromptu", minutes: 2, repeats: "always", appears: ["plan", "lesson", "practice"], skill: "impromptu" },
  { id: ACTIVITY_IDS.concise, kind: "speak", title: "Concise", minutes: 1, repeats: "always", appears: ["practice"], skill: "impromptu" },
  { id: ACTIVITY_IDS.freeRecord, kind: "speak", title: "Free record", minutes: 2, repeats: "always", appears: ["practice"], skill: "impromptu" },
  { id: ACTIVITY_IDS.script, kind: "speak", title: "Script take", minutes: 3, repeats: "always", appears: ["practice"], skill: "cadence" },
  { id: ACTIVITY_IDS.review, kind: "speak", title: "Quick review", minutes: 1, repeats: "always", appears: ["plan"] },
];

const REFLECT: Activity[] = [
  { id: ACTIVITY_IDS.rewind, kind: "reflect", title: "Rewind", minutes: 3, repeats: "always", appears: ["plan", "practice"] },
  { id: ACTIVITY_IDS.feeling, kind: "reflect", title: "Feeling of the week", minutes: 2, repeats: "always", appears: ["plan", "practice"] },
  { id: ACTIVITY_IDS.threeThings, kind: "reflect", title: "Three things", minutes: 2, repeats: "always", appears: ["plan", "practice"], skill: "confidence" },
  { id: ACTIVITY_IDS.talkBack, kind: "reflect", title: "Talk back", minutes: 3, repeats: "always", appears: ["practice"], skill: "confidence" },
  { id: ACTIVITY_IDS.phrasebook, kind: "reflect", title: "Phrasebook", minutes: 2, repeats: "always", appears: ["practice"] },
];

const MOMENTS: Activity[] = [
  { id: ACTIVITY_IDS.prime, kind: "moment", title: "Prime", minutes: 3, repeats: "once-per-event", appears: ["practice"], skill: "conversation" },
  { id: ACTIVITY_IDS.debrief, kind: "moment", title: "Debrief", minutes: 3, repeats: "once-per-event", appears: ["plan", "practice"], skill: "conversation" },
  { id: ACTIVITY_IDS.eventBefore, kind: "moment", title: "Moment, before", minutes: 1, repeats: "once-per-event", appears: ["practice"], skill: "confidence" },
  { id: ACTIVITY_IDS.eventAfter, kind: "moment", title: "Moment, after", minutes: 1, repeats: "once-per-event", appears: ["practice"], skill: "confidence" },
];

const CHECKS: Activity[] = [{ id: ACTIVITY_IDS.skillCheck, kind: "check", title: "Skill check", minutes: 5, repeats: "monthly", appears: ["path"] }];

const DRILLS: Activity[] = INDEPENDENT_DRILLS.map((d) => ({
  id: drillActivityId(d),
  kind: "drill" as const,
  title: DRILL_TITLES[d],
  minutes: 2,
  repeats: "always" as const,
  appears: ["plan", "lesson", "practice"] as Appears[],
  skill: DRILL_SKILL[d],
}));

const CONVERSATION: Activity[] = [...CONVERSATION_DRILLS, "conv_live" as const].map((d) => ({
  id: drillActivityId(d),
  kind: "conversation" as const,
  title: DRILL_TITLES[d],
  minutes: 2,
  repeats: "always" as const,
  appears: ["plan", "lesson", "practice"] as Appears[],
  skill: DRILL_SKILL[d],
}));

const GUIDED_ACTIVITIES: Activity[] = GUIDED.map((g) => ({
  id: guidedActivityId(g.id),
  kind: "drill" as const,
  title: g.title,
  minutes: 2,
  repeats: "always" as const,
  appears: ["plan", "lesson", "practice"] as Appears[],
  skill: g.skill ?? DRILL_SKILL.guided,
}));

const WARM_UP_ACTIVITIES: Activity[] = WARM_UPS.map((w) => ({
  id: warmupActivityId(w.id),
  kind: "drill" as const,
  title: w.title,
  minutes: 1,
  repeats: "always" as const,
  appears: ["plan", "lesson", "practice"] as Appears[],
  skill: DRILL_SKILL.warmup,
}));

const LESSON_ACTIVITIES: Activity[] = LESSONS.map((l) => ({
  id: lessonActivityId(l.id),
  kind: "lesson" as const,
  title: l.title,
  minutes: l.minutes,
  repeats: "once-then-reviews" as const,
  appears: ["path", "plan"] as Appears[],
  skill: l.skill,
}));

export const ACTIVITIES: Activity[] = [
  ...LESSON_ACTIVITIES,
  ...DRILLS,
  ...GUIDED_ACTIVITIES,
  ...WARM_UP_ACTIVITIES,
  ...CONVERSATION,
  ...SPEAK,
  ...REFLECT,
  ...MOMENTS,
  ...CHECKS,
];

const BY_ID = new Map(ACTIVITIES.map((a) => [a.id, a]));

export function getActivity(id: string): Activity | undefined {
  return BY_ID.get(id);
}

export function kindOfActivity(id: string): ActivityKind | null {
  return BY_ID.get(id)?.kind ?? null;
}
