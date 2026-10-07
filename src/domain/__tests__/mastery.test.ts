import { expectedScore, nextDifficulty, nextReviewIntervalDays, updateRating, INITIAL_RATING, TARGET_SUCCESS } from "../mastery";
import { paramsFor, scorePace, scoreCount, scoreAccuracy, scoreJustAMinute, tierForLevel } from "../drills/drillSpecs";

// Deterministic PRNG so the convergence test is stable.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

describe("staircase", () => {
  it("settles near the target success rate", () => {
    // Simulated learner: success probability falls as difficulty rises,
    // crossing 82% around level 5.
    const random = rng(42);
    const pSuccess = (level: number) => 1 / (1 + Math.exp(level - 6.5));
    let level = 1;
    let successes = 0;
    let counted = 0;
    for (let i = 0; i < 4000; i++) {
      const ok = random() < pSuccess(level);
      if (i >= 500) {
        successes += ok ? 1 : 0;
        counted += 1;
      }
      level = nextDifficulty(level, ok);
    }
    expect(Math.abs(successes / counted - TARGET_SUCCESS)).toBeLessThan(0.04);
    expect(level).toBeGreaterThan(3);
    expect(level).toBeLessThan(7);
  });

  it("clamps to 1..10", () => {
    expect(nextDifficulty(1, false)).toBe(1);
    expect(nextDifficulty(10, true)).toBe(10);
  });
});

describe("skill rating", () => {
  it("rises after beating expectations and falls after missing them", () => {
    const start = { rating: INITIAL_RATING, attempts: 0 };
    expect(updateRating(start, 1, 2).rating).toBeGreaterThan(INITIAL_RATING);
    expect(updateRating(start, 0, 2).rating).toBeLessThan(INITIAL_RATING);
  });

  it("moves less once there's history", () => {
    const early = updateRating({ rating: 50, attempts: 0 }, 1, 5).rating - 50;
    const late = updateRating({ rating: 50, attempts: 100 }, 1, 5).rating - 50;
    expect(late).toBeLessThan(early);
  });

  it("expects 50% when rating matches difficulty", () => {
    expect(expectedScore(50, 5)).toBeCloseTo(0.5);
  });
});

describe("spaced review", () => {
  it("grows on success and resets on a miss", () => {
    expect(nextReviewIntervalDays(null, true)).toBe(1);
    expect(nextReviewIntervalDays(1, true)).toBe(3);
    expect(nextReviewIntervalDays(14, true)).toBe(30);
    expect(nextReviewIntervalDays(30, true)).toBe(30);
    expect(nextReviewIntervalDays(14, false)).toBe(1);
  });
});

describe("drill specs", () => {
  it("tightens the pace band as level rises", () => {
    const easy = paramsFor("pace_reading", 1);
    const hard = paramsFor("pace_reading", 10);
    expect(easy.wpmMax! - easy.wpmMin!).toBeGreaterThan(hard.wpmMax! - hard.wpmMin!);
    expect(tierForLevel(8)).toBe("hard");
  });

  it("scores drills", () => {
    expect(scorePace(150, 95, { wpmMin: 130, wpmMax: 160 }).success).toBe(true);
    expect(scorePace(200, 95, { wpmMin: 130, wpmMax: 160 }).success).toBe(false);
    expect(scoreCount(12, 10, "animals").success).toBe(true);
    expect(scoreAccuracy(85, 120, 140).success).toBe(false);
    expect(scoreJustAMinute(0, 1, 2, 0.8).success).toBe(true);
  });
});
