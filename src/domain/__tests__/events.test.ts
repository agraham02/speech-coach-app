import {
  afterSummary,
  bannerEvent,
  countdownLabel,
  eventName,
  eventPhase,
  eventReminderPlan,
  focusResultLabel,
  nervesSummary,
  parseFocusResult,
  sortEvents,
  upcomingEvent,
  wentLabel,
  WENT_LABELS,
  type AfterCheckIn,
  type SpeakingEvent,
} from "../events";

const event = (extra: Partial<SpeakingEvent> = {}): SpeakingEvent => ({
  id: "e",
  kind: "pitch",
  title: null,
  date: "2026-10-20",
  createdAt: "2026-10-01T09:00:00.000Z",
  before: null,
  after: null,
  ...extra,
});

const AFTER: AfterCheckIn = { nerves: 4, went: null, focusResult: null, wentOkay: "", tryNext: "", at: "2026-10-21T12:00:00.000Z" };
const BEFORE = { nerves: 7, focus: "Slow down", at: "2026-10-19T12:00:00.000Z" };

describe("events", () => {
  it("names an event by its title, or its kind", () => {
    expect(eventName(event())).toBe("pitch");
    expect(eventName(event({ title: "  Board review " }))).toBe("Board review");
    expect(eventName(event({ kind: "other" }))).toBe("big day");
  });

  it("moves through upcoming, today, the debrief week, and done", () => {
    expect(eventPhase(event(), "2026-10-18")).toBe("upcoming");
    expect(eventPhase(event(), "2026-10-20")).toBe("today");
    expect(eventPhase(event({ after: AFTER }), "2026-10-20")).toBe("done");
    expect(eventPhase(event(), "2026-10-27")).toBe("debrief");
    expect(eventPhase(event(), "2026-10-28")).toBe("done");
    expect(eventPhase(event({ after: AFTER }), "2026-10-22")).toBe("done");
  });

  it("counts down in words", () => {
    expect(countdownLabel(0)).toBe("today");
    expect(countdownLabel(1)).toBe("tomorrow");
    expect(countdownLabel(5)).toBe("in 5 days");
  });

  it("picks the soonest event still ahead as the next one", () => {
    const events = [event({ id: "past", date: "2026-10-10" }), event({ id: "later", date: "2026-11-02" }), event({ id: "soon", date: "2026-10-22" })];
    expect(upcomingEvent(events, "2026-10-18")?.id).toBe("soon");
    expect(upcomingEvent(events, "2026-11-03")).toBeNull();
    // An event today is still the next one.
    expect(upcomingEvent(events, "2026-10-22")?.id).toBe("soon");
  });

  it("splits upcoming from past", () => {
    const { upcoming, past } = sortEvents([event({ id: "a", date: "2026-10-01" }), event({ id: "b", date: "2026-11-01" }), event({ id: "c", date: "2026-10-05" }), event({ id: "d", date: "2026-10-25" })], "2026-10-18");
    expect(upcoming.map((e) => e.id)).toEqual(["d", "b"]);
    expect(past.map((e) => e.id)).toEqual(["c", "a"]);
  });

  it("shows today's event first, then one waiting for its debrief, then the next one", () => {
    const ahead = event({ id: "ahead", date: "2026-10-25" });
    const waiting = event({ id: "waiting", date: "2026-10-16" });
    const today = event({ id: "today", date: "2026-10-18" });
    const told = event({ id: "told", date: "2026-10-15", after: AFTER });
    expect(bannerEvent([ahead, waiting, today, told], "2026-10-18")).toEqual({ event: today, phase: "today", others: 2 });
    expect(bannerEvent([ahead, waiting, told], "2026-10-18")).toEqual({ event: waiting, phase: "debrief", others: 1 });
    expect(bannerEvent([ahead, told], "2026-10-18")).toEqual({ event: ahead, phase: "upcoming", others: 0 });
    expect(bannerEvent([told], "2026-10-18")).toBeNull();
  });

  it("sets what you expected next to what happened, without grading", () => {
    expect(nervesSummary(8, 5)).toContain("Easier than you feared");
    expect(nervesSummary(5, 5)).toContain("You called it");
    expect(nervesSummary(3, 6)).toContain("you did it anyway");
    expect(nervesSummary(null, 5)).toBeNull();
  });
});

describe("event reminders", () => {
  const now = new Date(2026, 9, 18, 10, 0);

  it("arms the morning of and the day after", () => {
    const plan = eventReminderPlan([event({ id: "p", date: "2026-10-20" })], now);
    expect(plan.map((r) => [r.phase, r.date.getDate(), r.date.getHours()])).toEqual([
      ["before", 20, 8],
      ["after", 21, 12],
    ]);
  });

  it("skips a check-in already done, and moments already past", () => {
    expect(eventReminderPlan([event({ before: BEFORE })], now).map((r) => r.phase)).toEqual(["after"]);
    expect(eventReminderPlan([event({ date: "2026-10-18" })], now).map((r) => r.phase)).toEqual(["after"]);
    expect(eventReminderPlan([event({ date: "2026-10-16" })], now)).toEqual([]);
    expect(eventReminderPlan([event({ date: "2026-10-17", after: AFTER })], now)).toEqual([]);
  });

  it("only looks about a month ahead", () => {
    expect(eventReminderPlan([event({ date: "2026-12-30" })], now)).toEqual([]);
  });

  it("names the five stops from Rough to Great, and nothing else", () => {
    expect(WENT_LABELS).toHaveLength(5);
    expect([1, 2, 3, 4, 5].map(wentLabel)).toEqual(["Rough", "Not great", "Okay", "Good", "Great"]);
    expect(wentLabel(0)).toBeNull();
    expect(wentLabel(6)).toBeNull();
    expect(wentLabel(2.5)).toBeNull();
    expect(wentLabel(null)).toBeNull();
  });

  it("reads a focus answer only if it is one of the three", () => {
    expect(parseFocusResult("yes")).toBe("yes");
    expect(parseFocusResult("partly")).toBe("partly");
    expect(parseFocusResult("not")).toBe("not");
    expect(parseFocusResult("maybe")).toBeNull();
    expect(parseFocusResult(null)).toBeNull();
    expect(focusResultLabel("not")).toBe("Not this time");
    expect(focusResultLabel(null)).toBeNull();
  });

  it("sums up an after check-in in one line, leaving out what was not answered", () => {
    expect(afterSummary(null)).toBeNull();
    expect(afterSummary(AFTER)).toBeNull();
    expect(afterSummary({ ...AFTER, went: 4 })).toBe("Good");
    expect(afterSummary({ ...AFTER, went: 4, focusResult: "yes" })).toBe("Good · Did your focus");
    expect(afterSummary({ ...AFTER, went: 3, focusResult: "partly" })).toBe("Okay · Partly did your focus");
    expect(afterSummary({ ...AFTER, focusResult: "not" })).toBe("Focus for next time");
  });
});
