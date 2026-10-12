import type { SkillId } from "../theme/tokens";
import { DRILL_TITLES, type DrillType } from "./drills/drillSpecs";
import { chooseFocusSkill, hashString, type DailyPlan, type PlanInput, type PlanStep } from "./dailyPlan";
import type { LessonStep } from "../content/lessons";

// The daily goal: 1-3 practice sessions a day. Session 1 is the full daily
// plan; sessions 2 and 3 are short top-ups (3-5 min) on a different skill
// each — several short, spaced sessions beat one long one. The streak still
// only needs one session a day; missing a top-up never breaks it. Pure.

export type DailyGoal = 1 | 2 | 3;

type TopUpDrill = Extract<LessonStep, { kind: "drill" }>["drill"];

// Quick drills per skill. "loud" ones need a room where you can use your
// voice fully — left out when practicing somewhere shared.
const TOOLBOX: Record<SkillId, { drill: TopUpDrill; loud?: boolean }[]> = {
  articulation: [{ drill: "twister" }, { drill: "minimal_pairs" }],
  cadence: [{ drill: "marked_reading" }, { drill: "move_it", loud: true }, { drill: "pace_reading" }],
  impromptu: [{ drill: "word_chain" }, { drill: "just_a_minute" }, { drill: "category_fluency" }],
  confidence: [{ drill: "projection", loud: true }, { drill: "chain_bridge" }],
  conversation: [{ drill: "conv_reply" }, { drill: "conv_echo" }, { drill: "conv_thread" }],
};

const STEP_MINUTES: Partial<Record<DrillType, number>> = { move_it: 3, marked_reading: 2, just_a_minute: 2 };

export interface TopUpInput extends PlanInput {
  slot: 1 | 2;
  // Focus skills already practiced today (the main plan's, earlier top-ups').
  doneSkills: SkillId[];
  // Somewhere shared: no projection or Move It.
  quiet?: boolean;
}

export function buildTopUpPlan(input: TopUpInput): DailyPlan {
  // Pretend today's skills were just practiced (and twice in a row), so the
  // focus picker moves on to something else.
  const blocked = input.doneSkills[0];
  const focusSkill = chooseFocusSkill({
    ...input,
    date: `${input.date}#${input.slot}`,
    recentFocus: blocked ? [blocked, blocked] : input.recentFocus,
    skills: Object.fromEntries(
      Object.entries(input.skills).map(([skill, s]) => [
        skill,
        input.doneSkills.includes(skill as SkillId) ? { ...s, lastPracticedAt: `${input.date}T12:00:00`, rating: 100 } : s,
      ]),
    ) as PlanInput["skills"],
  });
  const tools = TOOLBOX[focusSkill].filter((t) => !(input.quiet && t.loud));
  const first = tools[hashString(`${input.date}:${input.slot}`) % tools.length];
  // A second, different quick one to round it out: retrieval or a marked line.
  const second: TopUpDrill = focusSkill === "impromptu" ? "marked_reading" : focusSkill === "cadence" ? "word_chain" : "marked_reading";
  const steps: PlanStep[] = [first.drill, second].map((drill, i) => ({
    id: `${i}`,
    kind: "drill",
    title: DRILL_TITLES[drill],
    detail: i === 0 ? "Quick top-up" : "Round it out",
    minutes: STEP_MINUTES[drill] ?? 2,
    lessonStep: { kind: "drill", drill },
  }));
  return { date: input.date, minutes: 5, focusSkill, lessonId: "", isReview: false, steps };
}

// --- reminders -------------------------------------------------------------

// The one-shot reminders to arm: each of today's remaining slots whose hour
// hasn't passed and that isn't done yet, plus the first slot of the next
// practice day. `practiceDays` are 0 (Sunday) - 6; empty means every day.
export function reminderDates(hours: number[], doneToday: number, now: Date, practiceDays: number[] = []): Date[] {
  const isPracticeDay = (d: Date) => !practiceDays.length || practiceDays.includes(d.getDay());
  const at = (day: Date, hour: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0, 0, 0);
  const out: Date[] = [];
  if (isPracticeDay(now)) {
    hours.forEach((hour, slot) => {
      const when = at(now, hour);
      if (when.getTime() > now.getTime() && doneToday <= slot) out.push(when);
    });
  }
  for (let ahead = 1; ahead <= 7 && hours.length; ahead++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead);
    if (isPracticeDay(day)) {
      out.push(at(day, hours[0]));
      break;
    }
  }
  return out;
}

// Spaced default hours for a goal, anchored on the first reminder.
export function defaultExtraHours(firstHour: number, goal: DailyGoal): number[] {
  if (goal === 1) return [];
  const later = (h: number) => Math.min(21, h);
  if (firstHour <= 9) return goal === 2 ? [later(firstHour + 9)] : [later(firstHour + 5), later(firstHour + 10)];
  if (firstHour <= 13) return goal === 2 ? [later(firstHour + 6)] : [later(firstHour + 4), later(firstHour + 8)];
  // Evening anchors: top-ups go earlier in the day.
  return goal === 2 ? [Math.max(8, firstHour - 8)] : [Math.max(8, firstHour - 10), Math.max(9, firstHour - 5)];
}

// --- goal met ---------------------------------------------------------------

// Days in the last `days` (ending today) where the goal was met. `counts`
// maps a local YYYY-MM-DD to sessions done that day. Unplanned days are left
// out of the total, so a rest day never counts against you.
export function goalDays(counts: Record<string, number>, goal: DailyGoal, today: Date, days = 7, practiceDays: number[] = []): { met: number; of: number } {
  let met = 0;
  let of = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    if (practiceDays.length && !practiceDays.includes(d.getDay())) continue;
    of += 1;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if ((counts[key] ?? 0) >= goal) met += 1;
  }
  return { met, of };
}
