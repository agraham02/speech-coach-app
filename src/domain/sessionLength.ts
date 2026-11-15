// Minutes a day (docs/overhaul/PLAN.md, section 9). One number replaces the
// old "sessions a day" and "session length" settings. Longer goals split into
// blocks, because spaced practice beats one long sitting and half an hour of
// talking non-stop is tiring. Pure.

export const MINUTE_CHOICES = [5, 10, 15, 20, 30] as const;
export type DailyMinutes = (typeof MINUTE_CHOICES)[number];

export const DEFAULT_MINUTES: DailyMinutes = 10;

export function isDailyMinutes(value: unknown): value is DailyMinutes {
  return typeof value === "number" && (MINUTE_CHOICES as readonly number[]).includes(value);
}

// The five slots a block is built from (section 5.3). "extra" is the 15-minute
// block's conversation or second rep; "review" is a second block's spaced
// lesson review.
export type SlotKind = "warmup" | "learn" | "drill" | "record" | "extra" | "review" | "reflect";

export interface BlockShape {
  minutes: number;
  // Minutes per slot, in the order the slots run. A slot with no budget is
  // left out of the block.
  budget: Partial<Record<SlotKind, number>>;
  // The second block of a 20 or 30 minute day.
  second: boolean;
}

// Section 9's table. Where the plan gives a range (15: Learn 3–4, Drill 2–3,
// Conversation or second rep 2–3), the budget picks a point inside it that
// keeps the block at its minutes.
const FIRST: Record<5 | 10 | 15, BlockShape["budget"]> = {
  5: { warmup: 1, learn: 1.5, record: 2.5 },
  10: { warmup: 1, learn: 2, drill: 2, record: 4, reflect: 1 },
  15: { warmup: 1, learn: 3, drill: 2.5, record: 5, extra: 2.5, reflect: 1 },
};

// "The second block is Drill, Conversation, Review, Reflect." Conversation is
// the "extra" slot.
const SECOND: Record<10 | 15, BlockShape["budget"]> = {
  10: { drill: 3, extra: 3, review: 3, reflect: 1 },
  15: { drill: 4, extra: 5, review: 5, reflect: 1 },
};

export const SLOT_ORDER: SlotKind[] = ["warmup", "learn", "drill", "record", "extra", "review", "reflect"];

export function blocksFor(minutes: DailyMinutes): BlockShape[] {
  switch (minutes) {
    case 5:
    case 10:
    case 15:
      return [{ minutes, budget: FIRST[minutes], second: false }];
    case 20:
      return [
        { minutes: 10, budget: FIRST[10], second: false },
        { minutes: 10, budget: SECOND[10], second: true },
      ];
    case 30:
      return [
        { minutes: 15, budget: FIRST[15], second: false },
        { minutes: 15, budget: SECOND[15], second: true },
      ];
  }
}

// The second block's suggested time ("Best around 6 pm").
export const SECOND_BLOCK_HOUR = 18;

// --- today vs your usual ------------------------------------------------------

// A day's override applies to that day only; your usual is untouched (R28).
export interface DayOverride {
  date: string; // YYYY-MM-DD
  minutes: DailyMinutes;
}

export function minutesFor(date: string, usual: DailyMinutes, override: DayOverride | null): DailyMinutes {
  return override && override.date === date ? override.minutes : usual;
}

// --- the ring -------------------------------------------------------------------

// Fills from anything you do, anywhere, toward today's goal. 0–1.
export function ringProgress(minutesDone: number, goal: DailyMinutes): number {
  return Math.max(0, Math.min(1, minutesDone / goal));
}

// --- nudges ---------------------------------------------------------------------

export type MinutesNudge = { kind: "raise" | "lower"; to: DailyMinutes } | null;

// The choice nearest a number of minutes, rounding down on a tie.
function nearestChoice(minutes: number): DailyMinutes {
  let best: DailyMinutes = MINUTE_CHOICES[0];
  for (const m of MINUTE_CHOICES) if (Math.abs(m - minutes) < Math.abs(best - minutes)) best = m;
  return best;
}

// `days` is minutes practised per day, most recent first, starting with
// yesterday (today isn't over), only for practice days. Above your usual 3
// days running: "Make 15 your usual?" Below it for a week: offer to lower it,
// no guilt. The suggestion is one step toward what you've actually done.
export const RAISE_AFTER_DAYS = 3;
export const LOWER_AFTER_DAYS = 7;

export function minutesNudge(days: number[], usual: DailyMinutes): MinutesNudge {
  const at = MINUTE_CHOICES.indexOf(usual);
  const recent = days.slice(0, RAISE_AFTER_DAYS);
  if (recent.length === RAISE_AFTER_DAYS && recent.every((m) => m > usual) && at < MINUTE_CHOICES.length - 1) {
    const typical = nearestChoice(Math.min(...recent));
    return { kind: "raise", to: typical > usual ? typical : MINUTE_CHOICES[at + 1] };
  }
  const week = days.slice(0, LOWER_AFTER_DAYS);
  if (week.length === LOWER_AFTER_DAYS && week.every((m) => m < usual) && at > 0) {
    const typical = nearestChoice(Math.max(...week));
    return { kind: "lower", to: typical < usual ? typical : MINUTE_CHOICES[at - 1] };
  }
  return null;
}

// --- goal met -------------------------------------------------------------------

// Days in the last `days` (ending today) where the day's goal was met.
// `done` maps a local YYYY-MM-DD to minutes practised; `goals` to that day's
// goal (its plan's minutes), falling back to `usual`. Rest days are left out.
export function goalDays(
  done: Record<string, number>,
  goals: Record<string, number>,
  usual: DailyMinutes,
  today: Date,
  days = 7,
  practiceDays: number[] = [],
): { met: number; of: number } {
  let met = 0;
  let of = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    if (practiceDays.length && !practiceDays.includes(d.getDay())) continue;
    of += 1;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if ((done[key] ?? 0) >= (goals[key] ?? usual)) met += 1;
  }
  return { met, of };
}
