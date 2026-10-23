import { getLessonStates, getSkillEvents, getSkillStates } from "../db/progressRepo";
import { listSkillChecks } from "../db/skillChecksRepo";
import { readPath, recordPathChange, writePath, type StoredPathUnit } from "../db/pathRepo";
import { getPathFinaleSeenAt, getPathPlanState, getUserProfile, setPathPlanState } from "../prefs/prefsStore";
import { isPathComplete } from "../../domain/pathFinale";
import { listEvents } from "../db/eventsRepo";
import { buildPath, nextLessonInUnit, reasonsFor, replan, type PathInput, type PathUnit } from "../../domain/path";
import { SKILLS } from "../../domain/mastery";
import { getUnit, lessonsInUnit } from "../../content/lessons";
import { emitPathCompleted, emitUnitCompleted } from "../progress/progressEvents";
import { todayISODate } from "../../utils/dateUtils";
import { logger } from "../../utils/logger";
import type { SkillId } from "../../theme/tokens";

// Keeps your path (domain/path.ts) built and current. It's built once —
// after the skill check, or on first launch for someone who started before
// paths existed — and re-planned only when something that shapes it
// changes: a unit finishes, your goals or event change, a skill check is
// retaken, or a week has gone by. A re-plan never moves what you're
// working on now.

const REPLAN_DAYS = 7;

async function gatherInput(): Promise<PathInput> {
  const [skills, lessons, checks, events] = await Promise.all([getSkillStates(), getLessonStates(), listSkillChecks(), listEvents().catch(() => [])]);
  const profile = getUserProfile();
  const check = checks.find((c) => c.results) ?? null;
  const today = todayISODate();
  return {
    today,
    obstacles: profile?.obstacles ?? [],
    contexts: profile?.contexts ?? [],
    events: events.filter((e) => e.date >= today).map((e) => ({ id: e.id, kind: e.kind, title: e.title, date: e.date })),
    check: check?.input ?? null,
    checkRatings: check?.results ? (Object.fromEntries(SKILLS.map((s) => [s, check.results!.skills[s].rating])) as Record<SkillId, number | null>) : {},
    ratings: Object.fromEntries(SKILLS.map((s) => [s, skills[s].rating])) as Record<SkillId, number>,
    lessons: Object.fromEntries(Object.entries(lessons).map(([id, l]) => [id, { done: l.done }])),
  };
}

// What the path was planned from, beyond your progress: a change in any of
// it is worth a re-plan.
function fingerprint(input: PathInput, checkId: string | null): string {
  return JSON.stringify({
    o: [...input.obstacles].sort(),
    c: [...input.contexts].sort(),
    e: input.events.map((e) => `${e.id}:${e.kind}:${e.date}`),
    k: checkId,
  });
}

let running: Promise<StoredPathUnit[]> | null = null;

// Builds the path if there isn't one, and re-plans it when it's due.
// Safe to call often (Today calls it on focus); concurrent calls share one run.
export function syncPath(options: { force?: boolean } = {}): Promise<StoredPathUnit[]> {
  if (!running) {
    running = doSync(options).finally(() => {
      running = null;
    });
  }
  return running;
}

async function doSync({ force }: { force?: boolean }): Promise<StoredPathUnit[]> {
  try {
    const [stored, input, checks] = await Promise.all([readPath(), gatherInput(), listSkillChecks()]);
    const checkId = checks.find((c) => c.results)?.id ?? null;
    const print = fingerprint(input, checkId);
    const state = getPathPlanState();
    const now = new Date();

    if (stored.length === 0) {
      await writePath(buildPath(input));
      setPathPlanState({ plannedAt: now.toISOString(), fingerprint: print });
      return readPath();
    }

    const finished = stored.filter((p) => p.status !== "done" && unitFinished(p.unitId, input.lessons));
    const stale = !state || now.getTime() - Date.parse(state.plannedAt) > REPLAN_DAYS * 86_400_000;
    if (!force && !finished.length && !stale && state?.fingerprint === print) return stored;

    const { path, changes } = replan(stored, input);
    await writePath(path);
    // Moves that come from progress alone aren't news; moves for a new
    // goal, event or check are.
    if (state?.fingerprint !== print || force) await recordPathChange(changes);
    setPathPlanState({ plannedAt: now.toISOString(), fingerprint: print });
    const fresh = await readPath();
    for (const unit of finished) await announceFinished(unit, stored, fresh, input);
    // The last unit: the finale follows its celebration, once. Missed (the
    // app closed first), it waits on Today's path card instead.
    if (finished.length && isPathComplete(fresh) && !getPathFinaleSeenAt()) emitPathCompleted();
    return fresh;
  } catch (error) {
    logger.error(`[path] sync failed — ${(error as Error).message}`);
    return readPath().catch(() => []);
  }
}

function unitFinished(unitId: string, lessons: PathInput["lessons"]): boolean {
  const all = lessonsInUnit(unitId);
  return all.length > 0 && all.every((l) => lessons[l.id]?.done);
}

// A finished unit gets its moment: what you practiced, what the skill did
// over it, and what's next.
async function announceFinished(unit: StoredPathUnit, before: StoredPathUnit[], after: StoredPathUnit[], input: PathInput): Promise<void> {
  const def = getUnit(unit.unitId);
  if (!def) return;
  let ratingFrom: number | null = null;
  const startedAt = before.find((p) => p.unitId === unit.unitId)?.startedAt ?? null;
  if (startedAt) {
    const events = await getSkillEvents(def.skill, 200);
    const first = [...events].reverse().find((e) => e.at >= startedAt);
    ratingFrom = first?.ratingBefore ?? null;
  }
  const nextId = after.find((p) => p.status === "active" && p.unitId !== unit.unitId)?.unitId ?? null;
  emitUnitCompleted({
    unitId: def.id,
    skill: def.skill,
    unitTitle: def.title,
    lessons: lessonsInUnit(def.id).map((l) => l.title),
    ratingFrom,
    ratingTo: input.ratings[def.skill] ?? null,
    next: nextId ? getUnit(nextId)?.title ?? null : null,
  });
}

// After a lesson finishes: the path may have moved on.
export function onLessonCompleted(): void {
  syncPath().catch(() => undefined);
}

// Re-plan from scratch after a fresh skill check or new goals: what you're
// working on stays, the rest is re-ordered and the moves are shown.
export async function replanPath(): Promise<StoredPathUnit[]> {
  return syncPath({ force: true });
}

export interface PathView {
  units: (StoredPathUnit & { title: string; skill: SkillId; done: number; total: number; nextLessonId: string | null })[];
}

// The stored path with what each unit's screen needs. The order is the
// stored one; the reasons are worked out fresh, so "in 12 days" counts down
// and a goal you've dropped stops being given as a reason.
export async function getPathView(): Promise<PathView> {
  const units = await syncPath();
  const input = await gatherInput();
  const states = input.lessons;
  return {
    units: units
      .map((u) => {
        const def = getUnit(u.unitId);
        if (!def) return null;
        const all = lessonsInUnit(def.id);
        const live = u.status === "tested_out" ? [] : reasonsFor(def, input);
        const kept = u.reasons.filter((r) => r.kind === "foundation" || r.kind === "weakness" || u.status === "tested_out");
        return {
          ...u,
          reasons: live.length ? live : kept,
          title: def.title,
          skill: def.skill,
          done: all.filter((l) => states[l.id]?.done).length,
          total: all.length,
          nextLessonId: nextLessonInUnit(def.id, states),
        };
      })
      .filter((u): u is NonNullable<typeof u> => !!u),
  };
}

export type { PathUnit };
