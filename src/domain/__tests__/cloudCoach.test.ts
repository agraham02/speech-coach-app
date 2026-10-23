import { acceptQuickCoach, mergeCloudCoach } from "../coach/cloudCoach";
import { ruleCoach, type CoachOutput } from "../coach/ruleCoach";

const rules: CoachOutput = ruleCoach({
  transcript: "I think the answer is that we should start small and build from there.",
  durationSeconds: 40,
  wpmAvg: 150,
  fillerRatePerMinute: 2,
  pauses: null,
  presence: null,
  pitchRangeHz: null,
});

const good = { strength: "You opened with your point.", tip: "Pause after your main idea.", focus_skill: "cadence", follow_up_question: "What would you try first?" };

describe("acceptQuickCoach", () => {
  it("accepts a complete card", () => {
    expect(acceptQuickCoach(good, "model-x")).toEqual({
      strength: "You opened with your point.",
      tip: "Pause after your main idea.",
      focusSkill: "cadence",
      followUpQuestion: "What would you try first?",
      model: "model-x",
    });
  });

  it("is case-insensitive about the skill and strips wrapping quotes", () => {
    const card = acceptQuickCoach({ ...good, focus_skill: " Confidence ", strength: '"Calm start."' });
    expect(card?.focusSkill).toBe("confidence");
    expect(card?.strength).toBe("Calm start.");
  });

  it("keeps the rest when the skill isn't one the app has", () => {
    expect(acceptQuickCoach({ ...good, focus_skill: "charisma" })?.focusSkill).toBeNull();
  });

  it("drops a missing or over-long follow-up question instead of failing", () => {
    expect(acceptQuickCoach({ ...good, follow_up_question: "" })?.followUpQuestion).toBeNull();
    expect(acceptQuickCoach({ ...good, follow_up_question: "x".repeat(300) })?.followUpQuestion).toBeNull();
  });

  it("rejects what can't be shown", () => {
    expect(acceptQuickCoach(undefined)).toBeNull();
    expect(acceptQuickCoach("text")).toBeNull();
    expect(acceptQuickCoach({ ...good, strength: "  " })).toBeNull();
    expect(acceptQuickCoach({ ...good, tip: 7 })).toBeNull();
    expect(acceptQuickCoach({ ...good, tip: "x".repeat(900) })).toBeNull();
  });
});

describe("mergeCloudCoach", () => {
  it("replaces the words and keeps what the phone measured", () => {
    const cloud = acceptQuickCoach(good)!;
    const merged = mergeCloudCoach(rules, cloud);
    expect(merged).toMatchObject({ source: "cloud", strength: good.strength, tip: good.tip, focusSkill: "cadence", followUpQuestion: good.follow_up_question });
    expect(merged.structure).toEqual(rules.structure);
    expect(merged.hedges).toEqual(rules.hedges);
    expect(merged.strongEnding).toBe(rules.strongEnding);
    expect(merged.observations).toEqual(rules.observations);
  });

  it("falls back to the rules' focus skill and question when the review gave none", () => {
    const merged = mergeCloudCoach(rules, acceptQuickCoach({ ...good, focus_skill: "nope", follow_up_question: "" })!);
    expect(merged.focusSkill).toBe(rules.focusSkill);
    expect(merged.followUpQuestion).toBe(rules.followUpQuestion);
  });
});
