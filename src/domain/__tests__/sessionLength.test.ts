import { blocksFor, goalDays, MINUTE_CHOICES, minutesFor, minutesNudge, ringProgress, SLOT_ORDER } from "../sessionLength";

const total = (budget: Partial<Record<string, number>>) => Object.values(budget).reduce((a: number, b) => a + (b ?? 0), 0);

describe("minutes a day: blocks and budgets (plan section 9)", () => {
  it("offers 5, 10, 15, 20 and 30", () => {
    expect([...MINUTE_CHOICES]).toEqual([5, 10, 15, 20, 30]);
  });

  it.each(MINUTE_CHOICES.map((m) => [m]))("%i minutes: the blocks' budgets add up to the goal", (m) => {
    const blocks = blocksFor(m);
    expect(blocks.reduce((sum, b) => sum + total(b.budget), 0)).toBe(m);
    for (const b of blocks) expect(total(b.budget)).toBe(b.minutes);
  });

  it("splits 20 into 10 + 10 and 30 into 15 + 15; shorter goals are one block", () => {
    expect(blocksFor(5).map((b) => b.minutes)).toEqual([5]);
    expect(blocksFor(10).map((b) => b.minutes)).toEqual([10]);
    expect(blocksFor(15).map((b) => b.minutes)).toEqual([15]);
    expect(blocksFor(20).map((b) => b.minutes)).toEqual([10, 10]);
    expect(blocksFor(30).map((b) => b.minutes)).toEqual([15, 15]);
  });

  it("follows the table's slots for each goal", () => {
    const slots = (m: (typeof MINUTE_CHOICES)[number], i = 0) => SLOT_ORDER.filter((s) => blocksFor(m)[i].budget[s] != null);
    expect(slots(5)).toEqual(["warmup", "learn", "record"]);
    expect(blocksFor(5)[0].budget).toEqual({ warmup: 1, learn: 1.5, record: 2.5 });
    expect(slots(10)).toEqual(["warmup", "learn", "drill", "record", "reflect"]);
    expect(blocksFor(10)[0].budget).toEqual({ warmup: 1, learn: 2, drill: 2, record: 4, reflect: 1 });
    expect(slots(15)).toEqual(["warmup", "learn", "drill", "record", "extra", "reflect"]);
    const fifteen = blocksFor(15)[0].budget;
    expect(fifteen.learn).toBeGreaterThanOrEqual(3);
    expect(fifteen.learn).toBeLessThanOrEqual(4);
    expect(fifteen.drill).toBeGreaterThanOrEqual(2);
    expect(fifteen.drill).toBeLessThanOrEqual(3);
    expect(fifteen.extra).toBeGreaterThanOrEqual(2);
    expect(fifteen.extra).toBeLessThanOrEqual(3);
    expect(fifteen.record).toBe(5);
    // The second block: Drill, Conversation, Review, Reflect.
    expect(slots(20, 1)).toEqual(["drill", "extra", "review", "reflect"]);
    expect(slots(30, 1)).toEqual(["drill", "extra", "review", "reflect"]);
    expect(blocksFor(20)[1].second).toBe(true);
  });
});

describe("a day's change leaves your usual alone (R28)", () => {
  it("uses the day's minutes on that day only", () => {
    const override = { date: "2026-11-15", minutes: 20 as const };
    expect(minutesFor("2026-11-15", 10, override)).toBe(20);
    expect(minutesFor("2026-11-16", 10, override)).toBe(10);
    expect(minutesFor("2026-11-15", 10, null)).toBe(10);
  });
});

describe("the ring", () => {
  it("fills toward today's goal and stops at full", () => {
    expect(ringProgress(0, 10)).toBe(0);
    expect(ringProgress(5, 10)).toBe(0.5);
    expect(ringProgress(25, 10)).toBe(1);
  });
});

describe("nudges", () => {
  it("offers a higher usual after 3 days above it", () => {
    expect(minutesNudge([16, 18, 15], 10)).toEqual({ kind: "raise", to: 15 });
    expect(minutesNudge([12, 11, 13], 10)).toEqual({ kind: "raise", to: 15 });
    expect(minutesNudge([31, 32, 35], 20)).toEqual({ kind: "raise", to: 30 });
    expect(minutesNudge([16, 9, 15], 10)).toBeNull();
    expect(minutesNudge([16, 18], 10)).toBeNull();
    expect(minutesNudge([40, 40, 40], 30)).toBeNull();
  });

  it("offers a lower usual after a week below it, and not sooner", () => {
    expect(minutesNudge([5, 4, 6, 5, 5, 3, 5], 15)).toEqual({ kind: "lower", to: 5 });
    expect(minutesNudge([8, 8, 8, 8, 8, 8, 8], 10)).toEqual({ kind: "lower", to: 5 });
    expect(minutesNudge([5, 4, 6, 5, 5, 3], 15)).toBeNull();
    expect(minutesNudge([5, 4, 6, 15, 5, 3, 5], 15)).toBeNull();
    expect(minutesNudge([1, 1, 1, 1, 1, 1, 1], 5)).toBeNull();
  });
});

describe("goal days", () => {
  it("counts days that met that day's goal, leaving rest days out", () => {
    const today = new Date(2026, 9, 12); // Monday
    const done = { "2026-10-12": 12, "2026-10-11": 6, "2026-10-10": 20 };
    const goals = { "2026-10-11": 5, "2026-10-10": 20 };
    expect(goalDays(done, goals, 10, today)).toEqual({ met: 3, of: 7 });
    expect(goalDays(done, {}, 10, today)).toEqual({ met: 2, of: 7 });
    expect(goalDays(done, goals, 10, today, 7, [1, 2, 3, 4, 5])).toEqual({ met: 1, of: 5 });
  });
});
