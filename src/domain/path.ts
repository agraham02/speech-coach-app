import type { SkillId } from "../theme/tokens";
import { UNITS, lessonsInUnit, type Unit } from "../content/lessons";
import { CHECK_SIGNALS, CONTEXT_REASONS, CONTEXT_UNITS, EVENT_UNITS, OBSTACLE_REASONS, OBSTACLE_UNITS } from "../content/pathTargets";
import { EVENT_NOUNS, type UpcomingEvent } from "./events";
import type { Obstacle, SpeakingContext } from "./profile";
import type { SkillCheckInput } from "./skillCheck";
import { daysBetween, dateFromISODate } from "../utils/dateUtils";

// Your path: every unit in one order, built for you. What you said gets in
// your way, an event coming up, where you speak and what the skill check
// heard pull units forward; foundations come before advanced work; skills
// take turns so no week is all one thing. Units you already showed in the
// skill check are marked, not removed. The order is stored once built and
// only re-planned at set moments (services/path/pathService.ts) — a path
// that reshuffled every day wouldn't feel like one. Pure.

export type PathStatus = "done" | "active" | "upcoming" | "tested_out";
export type ReasonKind = "obstacle" | "event" | "context" | "skill_check" | "weakness" | "foundation";

export interface PathReason {
  kind: ReasonKind;
  text: string;
}

export interface PathUnit {
  unitId: string;
  status: PathStatus;
  reasons: PathReason[];
}

export interface PathInput {
  today: string;
  obstacles: Obstacle[];
  contexts: SpeakingContext[];
  // Everything you're speaking at from today on, soonest first.
  events: UpcomingEvent[];
  // The latest skill check's measurements, and the ratings it placed you at.
  check: SkillCheckInput | null;
  checkRatings: Partial<Record<SkillId, number | null>>;
  // Current 0-100 rating per skill.
  ratings: Record<SkillId, number>;
  lessons: Record<string, { done: boolean }>;
}

// How many units are "now" at once — two, from different skills.
export const ACTIVE_COUNT = 2;
// A skill check rating this high shows the skill's foundations already.
export const TESTED_OUT_RATING = 38;
// An event this close starts pulling its units forward.
const EVENT_WINDOW_DAYS = 30;

const W = { obstacle: 1.0, event: 0.8, context: 0.4, check: 0.6, weakness: 0.5, tier: 0.35, sameSkill: 0.6, sameSkillTwoBack: 0.25, pull: 0.9 };

export function unitDone(unit: Unit, lessons: PathInput["lessons"]): boolean {
  const all = lessonsInUnit(unit.id);
  return all.length > 0 && all.every((l) => lessons[l.id]?.done);
}

export function unitStarted(unit: Unit, lessons: PathInput["lessons"]): boolean {
  return lessonsInUnit(unit.id).some((l) => lessons[l.id]?.done);
}

// Why a unit matters for you, strongest first.
export function reasonsFor(unit: Unit, input: PathInput): PathReason[] {
  const out: PathReason[] = [];
  // The soonest event in the window that needs this unit.
  const event = [...input.events]
    .filter((e) => e.date >= input.today && EVENT_UNITS[e.kind].includes(unit.id))
    .sort((a, b) => a.date.localeCompare(b.date))
    .find((e) => daysBetween(dateFromISODate(input.today), dateFromISODate(e.date)) <= EVENT_WINDOW_DAYS);
  if (event) {
    const days = daysBetween(dateFromISODate(input.today), dateFromISODate(event.date));
    const name = event.title?.trim() || `your ${EVENT_NOUNS[event.kind]}`;
    out.push({ kind: "event", text: days === 0 ? `For ${name}, today` : `For ${name} in ${days} ${days === 1 ? "day" : "days"}` });
  }
  for (const o of input.obstacles) {
    if (OBSTACLE_UNITS[o].includes(unit.id)) out.push({ kind: "obstacle", text: OBSTACLE_REASONS[o] });
  }
  if (input.check) {
    for (const signal of CHECK_SIGNALS) {
      if (signal.units.includes(unit.id) && signal.test(input.check)) out.push({ kind: "skill_check", text: signal.text(input.check) });
    }
  }
  for (const c of input.contexts) {
    if (CONTEXT_UNITS[c].includes(unit.id)) out.push({ kind: "context", text: CONTEXT_REASONS[c] });
  }
  return out;
}

function score(unit: Unit, reasons: PathReason[], input: PathInput): number {
  const count = (k: ReasonKind) => reasons.filter((r) => r.kind === k).length;
  const weakness = 1 - (input.ratings[unit.skill] ?? 25) / 100;
  return (
    W.obstacle * Math.min(2, count("obstacle")) +
    W.event * Math.min(1, count("event")) +
    W.context * Math.min(2, count("context")) +
    W.check * Math.min(2, count("skill_check")) +
    W.weakness * weakness -
    W.tier * (unit.tier - 1)
  );
}

function testedOut(unit: Unit, reasons: PathReason[], input: PathInput): boolean {
  const seed = input.checkRatings[unit.skill];
  // Only foundations, only when nothing you said or showed points at it.
  return unit.tier === 1 && seed != null && seed >= TESTED_OUT_RATING && reasons.length === 0;
}

export function buildPath(input: PathInput): PathUnit[] {
  const reasons = new Map(UNITS.map((u) => [u.id, reasonsFor(u, input)]));
  const done = UNITS.filter((u) => unitDone(u, input.lessons));
  const shown = UNITS.filter((u) => !done.includes(u) && !unitStarted(u, input.lessons) && testedOut(u, reasons.get(u.id)!, input));
  const placed = new Set<string>([...done, ...shown].map((u) => u.id));
  const ordered: Unit[] = [];

  // Started units first: you're partway through them already.
  for (const u of UNITS) {
    if (!placed.has(u.id) && unitStarted(u, input.lessons)) {
      ordered.push(u);
      placed.add(u.id);
    }
  }

  const remaining = () => UNITS.filter((u) => !placed.has(u.id));
  // Same-skill units of a lower tier come first, in order: `blocker` holds
  // `u` back.
  const blocks = (blocker: Unit, u: Unit) =>
    blocker.skill === u.skill && blocker.tier < u.tier && UNITS.indexOf(blocker) < UNITS.indexOf(u);
  const own = new Map(UNITS.map((u) => [u.id, score(u, reasons.get(u.id)!, input)]));
  // A unit someone needs pulls the units it waits on forward with it.
  const pulledBy = new Map<string, Unit>();
  const pull = (u: Unit) => {
    let best: Unit | null = null;
    for (const v of remaining()) {
      if (v.id !== u.id && blocks(u, v) && reasons.get(v.id)!.length && (!best || own.get(v.id)! > own.get(best.id)!)) best = v;
    }
    return best;
  };
  const eligible = (u: Unit) => {
    if (remaining().some((v) => blocks(v, u))) return false;
    // Advanced work waits for every foundation.
    if (u.tier === 3 && remaining().some((v) => v.tier === 1)) return false;
    return true;
  };

  while (remaining().length) {
    const prev = ordered[ordered.length - 1]?.skill;
    const prev2 = ordered[ordered.length - 2]?.skill;
    let best: { unit: Unit; value: number } | null = null;
    for (const u of remaining()) {
      if (!eligible(u)) continue;
      const leadsTo = pull(u);
      const base = Math.max(own.get(u.id)!, leadsTo ? W.pull * own.get(leadsTo.id)! : -Infinity);
      const value = base - (u.skill === prev ? W.sameSkill : 0) - (u.skill === prev2 ? W.sameSkillTwoBack : 0);
      if (!best || value > best.value + 1e-9) best = { unit: u, value };
    }
    // Eligibility always leaves one unit open; this is only a safety net.
    const next = best?.unit ?? remaining()[0];
    const leadsTo = pull(next);
    if (leadsTo && !reasons.get(next.id)!.length) pulledBy.set(next.id, leadsTo);
    ordered.push(next);
    placed.add(next.id);
  }

  const active = pickActive(ordered.map((u) => u.id));
  const withReasons = (u: Unit): PathReason[] => {
    const r = reasons.get(u.id)!;
    if (r.length) return r;
    const leads = pulledBy.get(u.id);
    if (leads) return [{ kind: "foundation", text: `Leads into ${leads.title}` }];
    if (weakest(u, input)) return [{ kind: "weakness", text: "Your lowest-rated skill right now" }];
    if (u.tier === 1) return [{ kind: "foundation", text: "A foundation the rest builds on" }];
    return [{ kind: "foundation", text: u.tier === 2 ? "Builds on the foundations" : "Puts it all to work" }];
  };
  return [
    ...done.map((u) => ({ unitId: u.id, status: "done" as const, reasons: withReasons(u) })),
    ...ordered.map((u) => ({ unitId: u.id, status: active.includes(u.id) ? ("active" as const) : ("upcoming" as const), reasons: withReasons(u) })),
    ...shown.map((u) => ({ unitId: u.id, status: "tested_out" as const, reasons: [{ kind: "skill_check" as const, text: "You showed this in your skill check" }] })),
  ];
}

// The skill clearly behind the others — at least 5 points under their mean.
function weakest(unit: Unit, input: PathInput): boolean {
  const mine = input.ratings[unit.skill];
  const others = (Object.keys(input.ratings) as SkillId[]).filter((k) => k !== unit.skill).map((k) => input.ratings[k]);
  if (!others.length || mine == null) return false;
  return mine === Math.min(...Object.values(input.ratings)) && mine <= others.reduce((a, b) => a + b, 0) / others.length - 5;
}

// The units you're working on now: the first not-done one, and the next
// one from a different skill.
export function pickActive(order: string[]): string[] {
  const out: string[] = [];
  for (const id of order) {
    const unit = UNITS.find((u) => u.id === id);
    if (!unit) continue;
    if (out.length === 0 || !out.some((a) => UNITS.find((u) => u.id === a)?.skill === unit.skill)) out.push(id);
    if (out.length >= ACTIVE_COUNT) break;
  }
  return out;
}

export interface PathChange {
  unitId: string;
  from: number;
  to: number;
  reason: string | null;
}

// Re-plans without upsetting what's underway: done, started and active
// units keep their place; only what you haven't begun is re-ordered. Units
// that were "shown already" stay that way. Returns the new path and the
// units that moved up enough to mention.
export function replan(old: PathUnit[], input: PathInput): { path: PathUnit[]; changes: PathChange[] } {
  const fresh = buildPath(input);
  const freshById = new Map(fresh.map((p) => [p.unitId, p]));
  const keepTestedOut = new Set(old.filter((p) => p.status === "tested_out").map((p) => p.unitId));
  const isDone = (id: string) => {
    const u = UNITS.find((x) => x.id === id);
    return !!u && unitDone(u, input.lessons);
  };
  const isFixed = (p: PathUnit) => {
    const u = UNITS.find((x) => x.id === p.unitId);
    return p.status === "active" || (!!u && unitStarted(u, input.lessons));
  };

  const done = UNITS.filter((u) => isDone(u.id)).map((u) => u.id);
  const fixed = old.filter((p) => !isDone(p.unitId) && !keepTestedOut.has(p.unitId) && isFixed(p)).map((p) => p.unitId);
  const known = new Set([...done, ...fixed, ...keepTestedOut]);
  // Units the old path didn't have (new content) slot in by the fresh order.
  const rest = fresh.filter((p) => !known.has(p.unitId) && p.status !== "done" && p.status !== "tested_out").map((p) => p.unitId);
  // A retaken skill check can show a foundation that was still to come.
  const newlyShown = fresh.filter((p) => p.status === "tested_out" && !known.has(p.unitId)).map((p) => p.unitId);

  const order = [...fixed, ...rest];
  const active = pickActive(order);
  const reasonsOf = (id: string) => freshById.get(id)?.reasons ?? old.find((o) => o.unitId === id)?.reasons ?? [];
  const path: PathUnit[] = [
    ...done.map((id) => ({ unitId: id, status: "done" as const, reasons: reasonsOf(id) })),
    ...order.map((id) => ({ unitId: id, status: active.includes(id) ? ("active" as const) : ("upcoming" as const), reasons: reasonsOf(id) })),
    ...[...keepTestedOut].filter((id) => !isDone(id)).map((id) => ({ unitId: id, status: "tested_out" as const, reasons: reasonsOf(id) })),
    ...newlyShown.map((id) => ({ unitId: id, status: "tested_out" as const, reasons: reasonsOf(id) })),
  ];

  // What moved up two or more places among the units not yet begun.
  const before = old.filter((p) => p.status === "upcoming" || p.status === "active").map((p) => p.unitId);
  const after = order;
  const changes: PathChange[] = [];
  after.forEach((id, to) => {
    const from = before.indexOf(id);
    if (from >= 0 && from - to >= 2) {
      const top = reasonsOf(id).find((r) => r.kind === "event" || r.kind === "obstacle" || r.kind === "skill_check");
      changes.push({ unitId: id, from, to, reason: top?.text ?? null });
    }
  });
  return { path, changes };
}

// "Lesson 2 of 3": where a lesson sits in its unit.
export function lessonPosition(lessonId: string): { unitId: string; index: number; count: number } | null {
  for (const u of UNITS) {
    const lessons = lessonsInUnit(u.id);
    const i = lessons.findIndex((l) => l.id === lessonId);
    if (i >= 0) return { unitId: u.id, index: i + 1, count: lessons.length };
  }
  return null;
}

// The next lesson to do in a unit, or null when it's finished.
export function nextLessonInUnit(unitId: string, lessons: PathInput["lessons"]): string | null {
  return lessonsInUnit(unitId).find((l) => !lessons[l.id]?.done)?.id ?? null;
}
