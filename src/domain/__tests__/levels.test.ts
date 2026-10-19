import {
  earnedStage,
  isRusty,
  nextStageHint,
  placementStage,
  MAX_SPEAKER_LEVEL,
  pointsToNextStage,
  speakerLevel,
  stageForRating,
  stageProgress,
  STAGE_FLOORS,
  type Stage,
} from "../levels";
import { expectedScore, INITIAL_RATING, nextDifficulty, updateRating } from "../mastery";
import { ratingFromScore } from "../skillCheck";

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

describe("stages", () => {
  it("bands the rating", () => {
    expect(stageForRating(0)).toBe(1);
    expect(stageForRating(INITIAL_RATING)).toBe(1);
    expect(stageForRating(35)).toBe(2);
    expect(stageForRating(61.9)).toBe(3);
    expect(stageForRating(62)).toBe(4);
    expect(stageForRating(100)).toBe(5);
  });

  it("never places anyone above Building from the skill check", () => {
    expect(placementStage(ratingFromScore(10)!)).toBe(2);
    expect(placementStage(ratingFromScore(0)!)).toBe(1);
  });

  it("keeps an earned stage when the rating dips", () => {
    expect(earnedStage(3, 40, 50)).toBe(3);
    expect(earnedStage(2, 63, 50)).toBe(4);
    expect(earnedStage(null, 36, 10)).toBe(2);
  });

  it("only earns a stage with the practice behind it", () => {
    expect(earnedStage(1, 40, 2)).toBe(1);
    expect(earnedStage(1, 70, 20)).toBe(3);
    expect(earnedStage(2, 70, 2)).toBe(2);
  });

  it("calls a real dip rusty, not a small one", () => {
    expect(isRusty(STAGE_FLOORS[3] - 2, 3)).toBe(false);
    expect(isRusty(STAGE_FLOORS[3] - 10, 3)).toBe(true);
    expect(isRusty(5, 1)).toBe(false);
  });

  it("measures progress toward the next stage", () => {
    expect(stageProgress(35, 2)).toBe(0);
    expect(stageProgress(41.5, 2)).toBeCloseTo(0.5);
    expect(stageProgress(90, 5)).toBe(1);
    expect(pointsToNextStage(43.2, 2)).toBe(5);
    expect(pointsToNextStage(90, 5)).toBe(0);
  });

  it("builds the speaker level from every skill", () => {
    expect(speakerLevel({})).toBe(1);
    expect(speakerLevel({ cadence: 2 })).toBe(2);
    expect(speakerLevel({ articulation: 5, cadence: 5, impromptu: 5, confidence: 5, conversation: 5 })).toBe(MAX_SPEAKER_LEVEL);
  });
});

describe("stage calibration", () => {
  // A learner whose real ability grows a little each practice day, with four
  // scored attempts in the skill each time: the first stage-up should land
  // within the first couple of weeks — soon enough to feel, not on day one.
  function daysToStage(target: number, growthPerDay: number, seed: number): number | null {
    const random = rng(seed);
    let ability = INITIAL_RATING;
    let state = { rating: INITIAL_RATING, attempts: 0 };
    let level = 1;
    let stage: Stage = 1;
    for (let day = 1; day <= 120; day++) {
      ability += growthPerDay;
      for (let i = 0; i < 4; i++) {
        const ok = random() < expectedScore(ability, level);
        const score = ok ? 0.8 + random() * 0.2 : 0.3 + random() * 0.3;
        state = updateRating(state, score, level);
        level = nextDifficulty(level, ok);
        stage = earnedStage(stage, state.rating, state.attempts);
      }
      if (stage >= target) return day;
    }
    return null;
  }

  it("reaches Building within about two weeks of steady practice", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const day = daysToStage(2, 0.8, seed);
      expect(day).not.toBeNull();
      expect(day!).toBeGreaterThanOrEqual(2);
      expect(day!).toBeLessThanOrEqual(14);
    }
  });

  it("keeps the top stage a long way off", () => {
    const day = daysToStage(5, 0.8, 7);
    expect(day == null || day > 45).toBe(true);
  });
});

describe("next stage hint", () => {
  it("names the gap: points first, then practice", () => {
    expect(nextStageHint(30, 2, 1)).toBe("5 points to Building");
    expect(nextStageHint(36, 2, 1)).toMatch(/4 more scored attempts to lock in Building/);
    expect(nextStageHint(95, 99, 5)).toMatch(/Top stage/);
  });
});
