import {
  EVENING_START_HOUR,
  EVENING_SESSION_LINE,
  MAX_VISIBLE_CARDS,
  MIDDAY_START_HOUR,
  MORNING_START_HOUR,
  SESSION_DONE_LINE,
  timeOfDay,
  todayCards,
  type MomentFact,
  type TodayCard,
  type TodayCardsInput,
} from "../cards";
import { isoDateFromDate } from "../../../utils/dateUtils";

// A fixed clock: Sunday 15 Nov 2026, local time. The real clock is never read.
const at = (hour: number, minute = 0) => new Date(2026, 10, 15, hour, minute);
const TODAY = "2026-11-15";
// The date `n` days from the fixed day (negative: before it).
const dayOffset = (n: number) => isoDateFromDate(new Date(2026, 10, 15 + n));

const quiet = (extra: Partial<TodayCardsInput> = {}): TodayCardsInput => ({
  now: at(13),
  session: { state: "not-started", anchorLine: null },
  takes: [],
  moments: [],
  rewind: { offer: null, inUnfinishedSession: false },
  threeThings: { keepsPractice: false, doneToday: false },
  feelingOfWeekDone: true,
  openMissions: 0,
  pendingDebrief: false,
  reviewDue: null,
  unseenProgress: { best: false, levelUp: false },
  skillCheck: { due: false, snoozed: false },
  comfortCheckIn: { due: false, snoozed: false },
  pathChanged: false,
  streak: { justBroke: false, why: null },
  modelInstalled: true,
  snoozedIds: [],
  ...extra,
});

const moment = (daysFromToday: number, extra: Partial<MomentFact> = {}): MomentFact => ({
  id: "m1",
  name: "your pitch",
  date: dayOffset(daysFromToday),
  debriefed: false,
  dismissed: false,
  ...extra,
});

const ids = (cards: TodayCard[]) => cards.map((c) => c.id);
const find = (cards: TodayCard[], id: string) => cards.find((c) => c.id === id);

describe("time of day", () => {
  it.each([
    [0, "evening"],
    [4, "evening"],
    [MORNING_START_HOUR, "morning"],
    [7, "morning"],
    [11, "morning"],
    [MIDDAY_START_HOUR, "midday"],
    [13, "midday"],
    [16, "midday"],
    [EVENING_START_HOUR, "evening"],
    [21, "evening"],
    [23, "evening"],
  ])("hour %i is %s", (hour, expected) => {
    expect(timeOfDay(at(hour))).toBe(expected);
  });
});

describe("the session card's line", () => {
  it.each([
    // [hour, state, anchor, text]
    [7, "not-started", "After your coffee.", "After your coffee."],
    [7, "in-progress", "After your coffee.", "After your coffee."],
    [7, "not-started", null, null],
    [7, "not-started", "   ", null],
    [13, "not-started", "After your coffee.", null],
    [21, "not-started", "After your coffee.", EVENING_SESSION_LINE],
    [21, "in-progress", "After your coffee.", null],
  ] as const)("at %i:00, %s, anchor %p: %p", (hour, state, anchorLine, text) => {
    const { session } = todayCards(quiet({ now: at(hour), session: { state, anchorLine } }));
    expect(session.text).toBe(text);
    expect(session.actions).toEqual([]);
  });

  it.each([7, 13, 21])("when done, at %i:00: 'Done for today' with Keep going and Something else", (hour) => {
    const { session } = todayCards(quiet({ now: at(hour), session: { state: "done", anchorLine: "After your coffee." } }));
    expect(session.text).toBe(SESSION_DONE_LINE);
    expect(session.text).toBe("Done for today ✓");
    expect(session.actions.map((a) => a.label)).toEqual(["Keep going", "Something else"]);
  });
});

describe("a quiet day", () => {
  it("has no cards and nothing behind Show more", () => {
    const out = todayCards(quiet());
    expect(out.cards).toEqual([]);
    expect(out.visible).toEqual([]);
    expect(out.more).toEqual([]);
    expect(out.moreLabel).toBeNull();
  });

  it("doesn't read the real clock: the same input gives the same output", () => {
    expect(todayCards(quiet({ moments: [moment(3)] }))).toEqual(todayCards(quiet({ moments: [moment(3)] })));
  });
});

describe("Moments by distance", () => {
  // [days from today, phase or null (no card), size]
  it.each([
    [15, null, null],
    [14, "soon", "line"],
    [5, "soon", "line"],
    [4, "soon", "line"],
    [3, "before", "full"],
    [1, "before", "full"],
    [0, "today", "full"],
    [-1, "after", "full"],
    [-3, "after", "full"],
    [-4, null, null],
  ] as const)("%i days out", (days, phase, size) => {
    const card = find(todayCards(quiet({ moments: [moment(days)] })).cards, "moment:m1");
    if (phase === null) {
      expect(card).toBeUndefined();
      return;
    }
    expect(card).toMatchObject({ kind: "moment", phase, size, daysUntil: days });
  });

  it.each([7, 13, 21])("is the same at %i:00", (hour) => {
    for (const days of [14, 3, 0, -1]) {
      const a = todayCards(quiet({ now: at(hour), moments: [moment(days)] })).cards;
      const b = todayCards(quiet({ now: at(13), moments: [moment(days)] })).cards;
      expect(a).toEqual(b);
    }
  });

  it("counts days from the calendar day, not the hour", () => {
    // 23:59 tonight is still 'today' for an event today, and 1 day out for tomorrow's.
    const late = at(23, 59);
    expect(find(todayCards(quiet({ now: late, moments: [moment(0)] })).cards, "moment:m1")).toMatchObject({ phase: "today" });
    expect(find(todayCards(quiet({ now: late, moments: [moment(1)] })).cards, "moment:m1")).toMatchObject({ phase: "before", daysUntil: 1 });
    expect(find(todayCards(quiet({ now: at(0, 1), moments: [moment(0)] })).cards, "moment:m1")).toMatchObject({ phase: "today" });
  });

  it("offers 'Warm up for it' before, and 'Warm up for it' and 'Check in' on the day", () => {
    const labels = (days: number) => (find(todayCards(quiet({ moments: [moment(days)] })).cards, "moment:m1") as { actions: { label: string }[] }).actions.map((a) => a.label);
    expect(labels(2)).toEqual(["Warm up for it"]);
    expect(labels(0)).toEqual(["Warm up for it", "Check in"]);
    expect(labels(-1)).toEqual(["How did it go?"]);
    expect(labels(10)).toEqual([]);
  });

  it("carries the days until, the days since and the name", () => {
    expect(find(todayCards(quiet({ moments: [moment(2, { name: "the board review" })] })).cards, "moment:m1")).toMatchObject({
      name: "the board review",
      daysUntil: 2,
      daysAgo: 0,
      date: dayOffset(2),
    });
    expect(find(todayCards(quiet({ moments: [moment(-2)] })).cards, "moment:m1")).toMatchObject({ daysUntil: -2, daysAgo: 2 });
  });

  it("goes away on the day it was debriefed, and once saved or dismissed after", () => {
    expect(find(todayCards(quiet({ moments: [moment(0, { debriefed: true })] })).cards, "moment:m1")).toBeUndefined();
    expect(find(todayCards(quiet({ moments: [moment(-1, { debriefed: true })] })).cards, "moment:m1")).toBeUndefined();
    expect(find(todayCards(quiet({ moments: [moment(-2, { dismissed: true })] })).cards, "moment:m1")).toBeUndefined();
    // Dismissing "How did it go?" doesn't hide an upcoming Moment.
    expect(find(todayCards(quiet({ moments: [moment(2, { dismissed: true })] })).cards, "moment:m1")).toBeDefined();
  });

  it("changes from before to today to after as the clock moves a day at a time", () => {
    const phaseOn = (dayShift: number) => {
      const now = new Date(2026, 10, 15 + dayShift, 9);
      const m: MomentFact = { id: "m1", name: "x", date: "2026-11-18", debriefed: false, dismissed: false };
      const card = find(todayCards(quiet({ now, moments: [m] })).cards, "moment:m1");
      return card && card.kind === "moment" ? card.phase : null;
    };
    expect([-2, 0, 1, 2, 3, 4, 5, 6, 7].map(phaseOn)).toEqual(["soon", "before", "before", "before", "today", "after", "after", "after", null]);
  });

  it("with several Moments, only the nearest further-out one gets a line", () => {
    const out = todayCards(
      quiet({
        moments: [moment(12, { id: "far" }), moment(6, { id: "near" }), moment(9, { id: "mid" })],
      }),
    );
    expect(ids(out.cards)).toEqual(["moment:near"]);
  });

  it("orders several Moments: today, then nearest before, then after", () => {
    const out = todayCards(
      quiet({
        moments: [moment(-1, { id: "a" }), moment(3, { id: "b" }), moment(1, { id: "c" }), moment(0, { id: "d" })],
      }),
    );
    expect(ids(out.cards)).toEqual(["moment:d", "moment:c", "moment:b", "moment:a"]);
  });
});

describe("your takes", () => {
  const take = (state: "working" | "stuck" | "ready", opened = false, id = "t1") => ({ id, title: "Intro", state, opened });

  it.each([
    ["working", false, true],
    ["stuck", false, true],
    ["ready", false, true],
    ["ready", true, false],
  ] as const)("%s, opened %p: shown %p", (state, opened, shown) => {
    const card = find(todayCards(quiet({ takes: [take(state, opened)] })).cards, "takes");
    expect(card !== undefined).toBe(shown);
    if (card) expect(card.size).toBe("full");
  });

  it("is one card listing only the takes that need attention", () => {
    const out = todayCards(quiet({ takes: [take("ready", true, "done"), take("working", false, "w"), take("ready", false, "r")] }));
    expect(out.cards).toHaveLength(1);
    expect(out.cards[0]).toMatchObject({ kind: "takes" });
    expect((out.cards[0] as { takes: { id: string }[] }).takes.map((t) => t.id)).toEqual(["w", "r"]);
  });
});

describe("Rewind", () => {
  const offerToday = { day: "today", date: TODAY } as const;
  const offerYesterday = { day: "yesterday", date: dayOffset(-1) } as const;

  it("is a full card when it's the only card, and says which day to tell", () => {
    expect(find(todayCards(quiet({ now: at(21), rewind: { offer: offerToday, inUnfinishedSession: false } })).cards, "rewind")).toMatchObject({
      kind: "rewind",
      size: "full",
      label: "Tell today",
      day: "today",
      date: TODAY,
    });
    expect(find(todayCards(quiet({ now: at(7), rewind: { offer: offerYesterday, inUnfinishedSession: false } })).cards, "rewind")).toMatchObject({
      size: "full",
      label: "Tell yesterday",
      day: "yesterday",
      date: dayOffset(-1),
    });
  });

  it("is a tile when anything else is showing", () => {
    const out = todayCards(quiet({ rewind: { offer: offerToday, inUnfinishedSession: false }, openMissions: 1 }));
    expect(find(out.cards, "rewind")).toMatchObject({ size: "tile" });
    const withTake = todayCards(quiet({ rewind: { offer: offerToday, inUnfinishedSession: false }, takes: [{ id: "t", title: "x", state: "working", opened: false }] }));
    expect(find(withTake.cards, "rewind")).toMatchObject({ size: "tile" });
  });

  it("is still full when the only other cards are one-liners", () => {
    const out = todayCards(quiet({ rewind: { offer: offerToday, inUnfinishedSession: false }, modelInstalled: false, pathChanged: true, moments: [moment(8)] }));
    expect(find(out.cards, "rewind")).toMatchObject({ size: "full" });
  });

  it("becomes full when the other cards are snoozed, and a tile again when they're not", () => {
    const rewind = { offer: offerToday, inUnfinishedSession: false };
    expect(find(todayCards(quiet({ rewind, openMissions: 2, snoozedIds: ["missions"] })).cards, "rewind")).toMatchObject({ size: "full" });
    expect(find(todayCards(quiet({ rewind, openMissions: 2 })).cards, "rewind")).toMatchObject({ size: "tile" });
  });

  it("is hidden when it's already a step in an unfinished session", () => {
    const out = todayCards(quiet({ rewind: { offer: offerToday, inUnfinishedSession: true } }));
    expect(find(out.cards, "rewind")).toBeUndefined();
    expect(out.cards).toEqual([]);
  });

  it("isn't there when there's nothing to tell, and goes when snoozed", () => {
    expect(todayCards(quiet()).cards).toEqual([]);
    expect(todayCards(quiet({ rewind: { offer: offerToday, inUnfinishedSession: false }, snoozedIds: ["rewind"] })).cards).toEqual([]);
  });

  it("does not count a hidden Rewind when deciding if another card is alone", () => {
    // Rewind hidden: the lone Three things tile stays a tile (only Rewind promotes).
    const out = todayCards(quiet({ now: at(7), rewind: { offer: offerToday, inUnfinishedSession: true }, threeThings: { keepsPractice: true, doneToday: false } }));
    expect(ids(out.cards)).toEqual(["three-things"]);
    expect(out.cards[0].size).toBe("tile");
  });
});

describe("Three things", () => {
  const keep = { keepsPractice: true, doneToday: false };

  it.each([
    [5, true],
    [7, true],
    [11, true],
    [12, false],
    [13, false],
    [21, false],
    [2, false],
  ])("at %i:00 shown %p", (hour, shown) => {
    const card = find(todayCards(quiet({ now: at(hour), threeThings: keep })).cards, "three-things");
    expect(card !== undefined).toBe(shown);
    if (card) expect(card.size).toBe("tile");
  });

  it("is not shown if you don't keep that practice, or once it's done", () => {
    expect(find(todayCards(quiet({ now: at(7), threeThings: { keepsPractice: false, doneToday: false } })).cards, "three-things")).toBeUndefined();
    expect(find(todayCards(quiet({ now: at(7), threeThings: { keepsPractice: true, doneToday: true } })).cards, "three-things")).toBeUndefined();
  });
});

describe("each card goes away when its condition clears", () => {
  // [card id, input that shows it, the same with the condition cleared, size]
  const cases: [string, Partial<TodayCardsInput>, Partial<TodayCardsInput>, string][] = [
    ["feeling-of-week", { feelingOfWeekDone: false }, { feelingOfWeekDone: true }, "tile"],
    ["missions", { openMissions: 2 }, { openMissions: 0 }, "tile"],
    ["missions", { pendingDebrief: true }, { pendingDebrief: false }, "tile"],
    ["review-due", { reviewDue: { lessonId: "l", title: "Pace", inTodaysSession: false } }, { reviewDue: null }, "tile"],
    ["review-due", { reviewDue: { lessonId: "l", title: "Pace", inTodaysSession: false } }, { reviewDue: { lessonId: "l", title: "Pace", inTodaysSession: true } }, "tile"],
    ["new-progress", { unseenProgress: { best: true, levelUp: false } }, { unseenProgress: { best: false, levelUp: false } }, "full"],
    ["new-progress", { unseenProgress: { best: false, levelUp: true } }, { unseenProgress: { best: false, levelUp: false } }, "full"],
    ["skill-check", { skillCheck: { due: true, snoozed: false } }, { skillCheck: { due: false, snoozed: false } }, "tile"],
    ["skill-check", { skillCheck: { due: true, snoozed: false } }, { skillCheck: { due: true, snoozed: true } }, "tile"],
    ["comfort-check-in", { comfortCheckIn: { due: true, snoozed: false } }, { comfortCheckIn: { due: false, snoozed: false } }, "tile"],
    ["comfort-check-in", { comfortCheckIn: { due: true, snoozed: false } }, { comfortCheckIn: { due: true, snoozed: true } }, "tile"],
    ["path-changed", { pathChanged: true }, { pathChanged: false }, "line"],
    ["streak-repair", { streak: { justBroke: true, why: "For my kids" } }, { streak: { justBroke: false, why: "For my kids" } }, "full"],
    ["model-download", { modelInstalled: false }, { modelInstalled: true }, "line"],
    ["takes", { takes: [{ id: "t", title: "x", state: "ready", opened: false }] }, { takes: [{ id: "t", title: "x", state: "ready", opened: true }] }, "full"],
  ];

  it.each(cases)("%s", (id, shown, cleared, size) => {
    const on = find(todayCards(quiet(shown)).cards, id);
    expect(on).toBeDefined();
    expect(on?.size).toBe(size);
    expect(find(todayCards(quiet(cleared)).cards, id)).toBeUndefined();
  });

  it("Three things goes away when done", () => {
    const base = { now: at(7) };
    expect(find(todayCards(quiet({ ...base, threeThings: { keepsPractice: true, doneToday: false } })).cards, "three-things")).toBeDefined();
    expect(find(todayCards(quiet({ ...base, threeThings: { keepsPractice: true, doneToday: true } })).cards, "three-things")).toBeUndefined();
  });

  it("streak repair carries the user's why", () => {
    expect(find(todayCards(quiet({ streak: { justBroke: true, why: "For my kids" } })).cards, "streak-repair")).toMatchObject({ why: "For my kids" });
    expect(find(todayCards(quiet({ streak: { justBroke: true, why: null } })).cards, "streak-repair")).toMatchObject({ why: null });
  });

  it("comfort check-in offers 'Check in'", () => {
    expect(find(todayCards(quiet({ comfortCheckIn: { due: true, snoozed: false } })).cards, "comfort-check-in")).toMatchObject({ actions: [{ label: "Check in" }] });
  });

  it("missions says how many and whether a debrief is waiting", () => {
    expect(find(todayCards(quiet({ openMissions: 2, pendingDebrief: true })).cards, "missions")).toMatchObject({ openMissions: 2, pendingDebrief: true });
  });
});

describe("ranking", () => {
  const busy = (extra: Partial<TodayCardsInput> = {}): TodayCardsInput =>
    quiet({
      now: at(7),
      takes: [{ id: "t", title: "x", state: "working", opened: false }],
      moments: [moment(0, { id: "today" }), moment(2, { id: "soon3" }), moment(-1, { id: "after" }), moment(9, { id: "far" })],
      rewind: { offer: { day: "yesterday", date: dayOffset(-1) }, inUnfinishedSession: false },
      threeThings: { keepsPractice: true, doneToday: false },
      feelingOfWeekDone: false,
      openMissions: 1,
      reviewDue: { lessonId: "l", title: "Pace", inTodaysSession: false },
      unseenProgress: { best: true, levelUp: false },
      skillCheck: { due: true, snoozed: false },
      comfortCheckIn: { due: true, snoozed: false },
      pathChanged: true,
      streak: { justBroke: true, why: null },
      modelInstalled: false,
      ...extra,
    });

  it("puts full cards first, then tiles, then one-liners", () => {
    const out = todayCards(busy());
    expect(ids(out.cards)).toEqual([
      "moment:today",
      "moment:soon3",
      "takes",
      "streak-repair",
      "moment:after",
      "new-progress",
      "rewind",
      "three-things",
      "missions",
      "review-due",
      "feeling-of-week",
      "skill-check",
      "comfort-check-in",
      "moment:far",
      "path-changed",
      "model-download",
    ]);
    const sizes = out.cards.map((c) => c.size);
    expect(sizes).toEqual([...sizes].sort((a, b) => ["full", "tile", "line"].indexOf(a) - ["full", "tile", "line"].indexOf(b)));
  });

  it("is not changed by the order the facts come in", () => {
    const a = todayCards(busy({ moments: [moment(0, { id: "a" }), moment(-1, { id: "b" })] }));
    const b = todayCards(busy({ moments: [moment(-1, { id: "b" }), moment(0, { id: "a" })] }));
    expect(ids(a.cards)).toEqual(ids(b.cards));
  });
});

describe("snoozing and 'Show N more'", () => {
  const fiveTiles = (extra: Partial<TodayCardsInput> = {}): TodayCardsInput =>
    quiet({
      feelingOfWeekDone: false,
      openMissions: 1,
      reviewDue: { lessonId: "l", title: "Pace", inTodaysSession: false },
      skillCheck: { due: true, snoozed: false },
      comfortCheckIn: { due: true, snoozed: false },
      ...extra,
    });

  it("hides a snoozed card for the day, any kind", () => {
    const all = todayCards(fiveTiles({ moments: [moment(0)], modelInstalled: false }));
    expect(ids(all.cards)).toEqual(expect.arrayContaining(["moment:m1", "model-download", "missions"]));
    const out = todayCards(fiveTiles({ moments: [moment(0)], modelInstalled: false, snoozedIds: ["moment:m1", "model-download", "missions"] }));
    expect(ids(out.cards)).not.toContain("moment:m1");
    expect(ids(out.cards)).not.toContain("model-download");
    expect(ids(out.cards)).not.toContain("missions");
    expect(ids(out.cards)).toContain("review-due");
  });

  it("shows everything when there are four or fewer", () => {
    const out = todayCards(quiet({ feelingOfWeekDone: false, openMissions: 1, skillCheck: { due: true, snoozed: false }, comfortCheckIn: { due: true, snoozed: false } }));
    expect(out.cards).toHaveLength(MAX_VISIBLE_CARDS);
    expect(out.visible).toEqual(out.cards);
    expect(out.more).toEqual([]);
    expect(out.moreLabel).toBeNull();
  });

  it("puts the lowest-ranked beyond four behind 'Show 1 more'", () => {
    const out = todayCards(fiveTiles());
    expect(out.cards).toHaveLength(5);
    expect(ids(out.visible)).toEqual(["missions", "review-due", "feeling-of-week", "skill-check"]);
    expect(ids(out.more)).toEqual(["comfort-check-in"]);
    expect(out.moreLabel).toBe("Show 1 more");
  });

  it("says 'Show 2 more' for six", () => {
    const out = todayCards(fiveTiles({ unseenProgress: { best: true, levelUp: false } }));
    expect(out.cards).toHaveLength(6);
    expect(out.visible).toHaveLength(4);
    expect(out.more).toHaveLength(2);
    expect(out.moreLabel).toBe("Show 2 more");
    // Full cards rank first, so New progress stays in view.
    expect(ids(out.visible)[0]).toBe("new-progress");
  });

  it("keeps one-line cards visible, and doesn't count them toward the four", () => {
    const out = todayCards(fiveTiles({ pathChanged: true, modelInstalled: false, moments: [moment(10)] }));
    expect(out.cards).toHaveLength(8);
    expect(ids(out.visible)).toEqual(expect.arrayContaining(["moment:m1", "path-changed", "model-download"]));
    expect(out.visible.filter((c) => c.size !== "line")).toHaveLength(4);
    expect(out.more.every((c) => c.size !== "line")).toBe(true);
    expect(out.moreLabel).toBe("Show 1 more");
  });

  it("snoozing a card brings the next one into view", () => {
    const out = todayCards(fiveTiles({ snoozedIds: ["missions"] }));
    expect(out.moreLabel).toBeNull();
    expect(ids(out.visible)).toEqual(["review-due", "feeling-of-week", "skill-check", "comfort-check-in"]);
  });
});
