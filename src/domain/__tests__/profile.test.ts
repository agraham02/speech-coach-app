import { defaultsFromProfile, priorityFor, promptContexts, type UserProfile } from "../profile";
import { evaluateSkillCheck, feltBelowObserved, ratingFromScore } from "../skillCheck";

const profile = (extra: Partial<UserProfile> = {}): UserProfile => ({ contexts: [], obstacles: [], startedAt: "2026-10-12", ...extra });

describe("profile personalization", () => {
  it("leans the plan toward what gets in your way, fading over about four weeks", () => {
    const p = profile({ obstacles: ["ramble", "monotone"] });
    const day1 = priorityFor(p, "2026-10-12");
    expect(day1.conversation).toBeGreaterThan(0);
    expect(day1.cadence).toBeGreaterThan(0);
    expect(day1.articulation).toBeUndefined();
    const week2 = priorityFor(p, "2026-10-26");
    expect(week2.cadence!).toBeLessThan(day1.cadence!);
    expect(priorityFor(p, "2026-11-20").cadence ?? 0).toBe(0);
  });

  it("holds the event's skills until the event", () => {
    const p = profile();
    const event = { id: "e1", kind: "interview" as const, date: "2026-12-01", title: null };
    expect(priorityFor(p, "2026-11-25", event).impromptu).toBe(0.2);
    expect(priorityFor(p, "2026-12-02", event).impromptu ?? 0).toBe(0);
    expect(priorityFor(null, "2026-11-25", event).impromptu).toBe(0.2);
    expect(promptContexts(p, "2026-11-25", event)).toEqual(["interviews"]);
    expect(promptContexts({ ...p, contexts: ["meetings"] }, "2026-10-12", event)).toEqual(["meetings"]);
  });

  it("turns answers into defaults", () => {
    expect(defaultsFromProfile(profile({ speakingComfort: 1 })).recordBlind).toBe(true);
    expect(defaultsFromProfile(profile({ practicePlace: "shared" })).quiet).toBe(true);
    expect(defaultsFromProfile(profile({ speechDifference: "stutter" })).stutterMode).toBe(true);
    expect(defaultsFromProfile(profile({ englishFirst: "no" })).relaxAccuracy).toBe(true);
    expect(defaultsFromProfile(null).recordBlind).toBe(false);
  });
});

describe("skill check", () => {
  it("maps 0-10 onto a 15-45 starting rating", () => {
    expect(ratingFromScore(0)).toBe(15);
    expect(ratingFromScore(10)).toBe(45);
    expect(ratingFromScore(null)).toBeNull();
  });

  it("covers all five skills and names strengths before focus areas", () => {
    const r = evaluateSkillCheck({
      readAccuracy: 95,
      readWpm: 150,
      categoryCount: 4,
      categoryTarget: 8,
      replyLatencyMs: 1200,
      askedBack: true,
      talkSeconds: 110,
      talkWpm: 185,
      fillerRatePerMinute: 9,
      boundaryPauseRate: 0.7,
      eyeContactPercent: 72,
      expressiveness: 40,
      hedgeCount: 1,
      strongEnding: true,
    });
    for (const s of ["articulation", "cadence", "impromptu", "confidence", "conversation"] as const) expect(r.skills[s].score).not.toBeNull();
    expect(r.strengths.length).toBe(2);
    expect(r.focus.length).toBeGreaterThan(0);
    expect(r.focus.some((f) => f.skill === "impromptu")).toBe(true);
    expect(r.observed).toBeGreaterThanOrEqual(1);
  });

  it("never counts fillers or stalls against someone who stutters", () => {
    const base = { categoryCount: 8, categoryTarget: 8, fillerRatePerMinute: 15, hesitations: 6 };
    const usual = evaluateSkillCheck(base).skills.impromptu.score!;
    const stutter = evaluateSkillCheck({ ...base, stutterMode: true });
    expect(stutter.skills.impromptu.score!).toBeGreaterThan(usual);
    expect(stutter.skills.impromptu.work.join(" ")).not.toMatch(/filler/);
  });

  it("leaves unmeasured skills alone", () => {
    const r = evaluateSkillCheck({ readAccuracy: 90 });
    expect(r.skills.conversation.rating).toBeNull();
    expect(r.skills.articulation.rating).not.toBeNull();
  });

  it("notices when you came across better than you felt", () => {
    expect(feltBelowObserved(2, 4)).toBe(true);
    expect(feltBelowObserved(4, 4)).toBe(false);
  });
});
