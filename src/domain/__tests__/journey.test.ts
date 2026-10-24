import { biggestMover, describeJourney, EMPTY_JOURNEY, scoreStory, skillsThatGrew, spanLabel, takeFacts, type JourneyFacts, type JourneySkill } from "../journey";

const skill = (id: JourneySkill["skill"], startStage: JourneySkill["startStage"], nowStage: JourneySkill["nowStage"], startRating: number, nowRating: number): JourneySkill => ({
  skill: id,
  startStage,
  nowStage,
  startRating,
  nowRating,
});

const facts = (patch: Partial<JourneyFacts> = {}): JourneyFacts => ({ ...EMPTY_JOURNEY, ...patch });

describe("spanLabel", () => {
  it("speaks in the unit that fits", () => {
    expect(spanLabel(0)).toBe("1 day");
    expect(spanLabel(9)).toBe("9 days");
    expect(spanLabel(21)).toBe("3 weeks");
    expect(spanLabel(95)).toBe("3 months");
    expect(spanLabel(400)).toBe("1 year and 1 month");
    expect(spanLabel(730)).toBe("2 years");
  });
});

describe("describeJourney", () => {
  const today = new Date(2026, 9, 24);

  it("tells the span, what was done and the best streak, leaving out zeros", () => {
    const text = describeJourney(facts({ startedOn: "2026-07-24", takes: 41, drills: 0, practiceDays: 23, longestStreak: 9 }), today);
    expect(text).toBe("You started 3 months ago. Since then you've recorded 41 takes and practiced on 23 days. Your longest streak was 9 days.");
  });

  it("says nothing when there is nothing to say", () => {
    expect(describeJourney(facts(), today)).toBeNull();
  });

  it("uses the singular", () => {
    expect(describeJourney(facts({ startedOn: "2026-10-23", takes: 1 }), today)).toContain("recorded 1 take.");
  });
});

describe("skills", () => {
  const f = facts({ skills: [skill("cadence", 1, 3, 20, 55), skill("impromptu", 2, 2, 30, 36), skill("confidence", 1, 2, 25, 40), skill("articulation", 2, 2, 40, 38)] });

  it("lists the skills that grew a stage, biggest jump first", () => {
    expect(skillsThatGrew(f).map((s) => s.skill)).toEqual(["cadence", "confidence"]);
  });

  it("finds the skill that moved the most", () => {
    expect(biggestMover(f)?.skill).toBe("cadence");
    expect(biggestMover(facts({ skills: [skill("cadence", 1, 1, 20, 20)] }))).toBeNull();
  });
});

describe("takeFacts and scoreStory", () => {
  const take = (n: number, score: number | null) => ({ sessionId: `s${n}`, date: `2026-0${n}-01`, score });

  it("compares the first scored take with the average of the latest few", () => {
    const got = takeFacts([take(1, 4.0), take(2, 5), take(3, null), take(4, 6), take(5, 7), take(6, 8), take(7, 7), take(8, 9)]);
    expect(got.firstTake).toMatchObject({ sessionId: "s1", score: 4 });
    expect(got.bestTake).toMatchObject({ sessionId: "s8", score: 9 });
    expect(got.recentCount).toBe(5);
    expect(got.recentScore).toBe(7.4);
    expect(scoreStory({ ...EMPTY_JOURNEY, ...got })).toEqual({ first: 4, now: 7.4, change: 3.4, over: 5 });
  });

  it("makes no story from a single take, or from none", () => {
    expect(scoreStory({ ...EMPTY_JOURNEY, ...takeFacts([take(1, 5)]) })).toBeNull();
    expect(takeFacts([])).toEqual({ firstTake: null, bestTake: null, recentScore: null, recentCount: 0 });
  });

  it("keeps an unscored first take as the first take", () => {
    const got = takeFacts([take(1, null)]);
    expect(got.firstTake).toMatchObject({ sessionId: "s1", score: null });
    expect(got.bestTake).toBeNull();
  });
});
