import { bandOf, difficultyLabel, filterPromptsByTier, isSurprise, takeDifficultyOf, takeDurationSeconds, takePrepSeconds, takeTier, warmUpIntensityFor } from "../scale";
import type { Prompt } from "../../sessionTypes";

describe("one difficulty scale", () => {
  it("bands: Easy 1-3, Medium 4-6, Hard 7-10", () => {
    expect([1, 3.9, 4, 6.9, 7, 10].map(bandOf)).toEqual(["Easy", "Easy", "Medium", "Medium", "Hard", "Hard"]);
    expect(difficultyLabel(4.6)).toBe("Difficulty 4 · Medium");
    expect(takeTier(8)).toBe("hard");
  });

  it("takes run from 28 s prep and 55 s long to 5 s and 145 s, then a surprise", () => {
    expect(takePrepSeconds(1)).toBe(28);
    expect(takePrepSeconds(9)).toBe(5);
    expect(takePrepSeconds(10)).toBe(0);
    expect(isSurprise(10)).toBe(true);
    expect(takeDurationSeconds(1)).toBe(55);
    expect(takeDurationSeconds(10)).toBe(145);
    // Easier never has more length or less prep than harder.
    for (let l = 1; l < 10; l++) {
      expect(takeDurationSeconds(l + 1)).toBeGreaterThanOrEqual(takeDurationSeconds(l));
      expect(takePrepSeconds(l + 1)).toBeLessThanOrEqual(takePrepSeconds(l));
    }
  });

  it("a take's difficulty comes back from its own settings", () => {
    for (const l of [1, 4, 7, 9]) {
      const back = takeDifficultyOf({ tier: takeTier(l), prepSeconds: takePrepSeconds(l), durationSeconds: takeDurationSeconds(l) });
      expect(Math.abs(back - l)).toBeLessThan(1.6);
    }
    // A cold, long take on a hard prompt is hard; an easy short one with prep is easy.
    expect(takeDifficultyOf({ tier: "hard", prepSeconds: 0, durationSeconds: 150 })).toBeGreaterThanOrEqual(9);
    expect(takeDifficultyOf({ tier: "easy", prepSeconds: 30, durationSeconds: 45 })).toBeLessThan(2);
    // Unknown parts are left out.
    expect(takeDifficultyOf({ tier: null, prepSeconds: null, durationSeconds: null })).toBe(1);
    expect(takeDifficultyOf({ tier: "medium", prepSeconds: null, durationSeconds: null })).toBe(5);
  });

  it("warm-ups grow with the band, and the prompt pool widens when thin", () => {
    expect([2, 5, 8].map(warmUpIntensityFor)).toEqual(["short", "medium", "long"]);
    const p = (id: string, difficultyTier: Prompt["difficultyTier"]): Prompt => ({ id, category: "c", text: id, difficultyTier });
    const pool = [p("a", "easy"), p("b", "medium"), p("c", "hard")];
    expect(filterPromptsByTier(pool, "easy", 1).map((x) => x.id)).toEqual(["a"]);
    expect(filterPromptsByTier(pool, "easy", 5).map((x) => x.id)).toEqual(["a", "b"]);
  });
});
