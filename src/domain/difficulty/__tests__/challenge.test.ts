import { CHALLENGE_TARGET, stretchDue, stretchWeekOf } from "../challenge";
import { nextDifficulty } from "../../mastery";

describe("challenge and stretch", () => {
  it("Standard keeps today's staircase; Gentle steps up less and Push me more", () => {
    expect(nextDifficulty(5, true)).toBe(5.18);
    expect(nextDifficulty(5, true, CHALLENGE_TARGET.standard)).toBe(5.18);
    expect(nextDifficulty(5, true, CHALLENGE_TARGET.gentle)).toBe(5.1);
    expect(nextDifficulty(5, false, CHALLENGE_TARGET.gentle)).toBe(4.1);
    expect(nextDifficulty(5, true, CHALLENGE_TARGET.push)).toBe(5.3);
    expect(nextDifficulty(5, false, CHALLENGE_TARGET.push)).toBe(4.3);
  });

  it("each staircase settles at its own success rate", () => {
    for (const target of Object.values(CHALLENGE_TARGET)) {
      // At the target rate, the expected step is zero.
      const drift = target * (1 - target) - (1 - target) * target;
      expect(Math.abs(drift)).toBeLessThan(1e-9);
    }
  });

  it("a Stretch is due once a week, from Monday", () => {
    expect(stretchDue(null, "2026-11-09")).toBe(true);
    expect(stretchWeekOf("2026-11-12")).toBe("2026-11-09");
    expect(stretchDue("2026-11-09", "2026-11-15")).toBe(false);
    expect(stretchDue("2026-11-09", "2026-11-16")).toBe(true);
  });
});
