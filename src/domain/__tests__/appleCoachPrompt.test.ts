import { appleCoachSchema, buildAppleCoachPrompt, mergeAppleCoach, trimTranscript } from "../coach/appleCoachPrompt";
import { ruleCoach } from "../coach/ruleCoach";

const input = {
  transcript: "Remote work is better. Because you skip the commute. For example I gained an hour. That's why.",
  durationSeconds: 40,
  wpmAvg: 150,
  fillerRatePerMinute: 2,
  pauses: null,
  presence: null,
  pitchRangeHz: 90,
  promptText: "Is remote work better?",
  targetFramework: "PREP" as const,
};

describe("apple coach prompt", () => {
  it("includes the prompt, measurements, target framework and transcript", () => {
    const rules = ruleCoach(input);
    const prompt = buildAppleCoachPrompt(input, rules);
    expect(prompt).toContain('"Is remote work better?"');
    expect(prompt).toContain("Pace: 150 wpm (good)");
    expect(prompt).toContain("Point–Reason–Example–Point");
    expect(prompt).toContain("Remote work is better.");
  });

  it("trims very long transcripts to fit the on-device context", () => {
    const long = Array(2000).fill("word").join(" ");
    expect(trimTranscript(long, 900).split(" ").length).toBe(901);
  });

  it("merges model wording but keeps measured observations", () => {
    const rules = ruleCoach(input);
    const merged = mergeAppleCoach(
      rules,
      appleCoachSchema.parse({
        structureDetected: "PREP",
        mainPoint: "Remote work is better",
        strength: "You led with a clear claim.",
        tip: '"Give a second example."',
        followUpQuestion: "What would make you go back to an office?",
      }),
    );
    expect(merged.source).toBe("apple");
    expect(merged.tip).toBe("Give a second example.");
    expect(merged.observations).toEqual(rules.observations);
  });

  it("rejects an unknown framework", () => {
    expect(() =>
      appleCoachSchema.parse({ structureDetected: "Haiku", mainPoint: "", strength: "", tip: "", followUpQuestion: "" }),
    ).toThrow();
  });
});
