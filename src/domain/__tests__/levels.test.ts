import {
  attemptLabel,
  earnedStage,
  isRusty,
  levelForScore,
  nextLevelAt,
  nextStageHint,
  placementStage,
  MAX_SPEAKER_LEVEL,
  pointsToNextStage,
  stageForRating,
  stageProgress,
  STAGE_FLOORS,
  type NodeProgress,
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

const practice = (attempts: number, goodAt: NodeProgress["goodAt"] = {}): NodeProgress => ({ attempts, goodAt });

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
    expect(earnedStage(3, 40, practice(50))).toBe(3);
    expect(earnedStage(2, 63, practice(50, { 5: 5 }))).toBe(4);
    expect(earnedStage(null, 36, practice(10))).toBe(2);
  });

  it("only earns a stage with the practice behind it", () => {
    expect(earnedStage(1, 40, practice(2))).toBe(1);
    expect(earnedStage(1, 70, practice(20, { 3: 3 }))).toBe(3);
    expect(earnedStage(2, 70, practice(2))).toBe(2);
  });

  // Plan 6.3's table, in full.
  it.each<[Stage, number, number, NodeProgress["goodAt"]]>([
    [2, 35, 6, {}],
    [3, 48, 18, { 3: 3 }],
    [4, 62, 36, { 5: 5 }],
    [5, 80, 60, { 6: 8 }],
  ])("stage %i takes a score of %i, %i attempts and its proof", (stage, score, attempts, goodAt) => {
    const below = (stage - 1) as Stage;
    expect(earnedStage(1, score, practice(attempts, goodAt))).toBe(stage);
    expect(earnedStage(1, score - 0.1, practice(attempts, goodAt))).toBeLessThan(stage);
    expect(earnedStage(1, score, practice(attempts - 1, goodAt))).toBeLessThan(stage);
    if (Object.keys(goodAt).length) {
      const [difficulty, good] = Object.entries(goodAt)[0];
      expect(earnedStage(1, score, practice(attempts, { [difficulty]: (good as number) - 1 }))).toBeLessThan(stage);
      // Easier attempts prove nothing, whatever the score.
      expect(earnedStage(1, score, practice(attempts, { [Number(difficulty) - 2]: 100 }))).toBeLessThan(stage);
    }
    expect(below).toBeGreaterThan(0);
  });

  it("says what stands between you and the next stage, proof included", () => {
    expect(nextStageHint(50, 18, 2, { 3: 1 })).toBe("Rating's there. 2 more good attempts at difficulty 3 or harder to reach Steady");
    expect(nextStageHint(50, 18, 2, { 3: 3 })).toBe("Steady is next");
    expect(nextStageHint(50, 10, 2, { 3: 3 })).toBe("Rating's there. 8 more scored attempts to lock in Steady");
    expect(nextStageHint(40, 18, 2, { 3: 3 })).toBe("8 points to Steady");
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

});

describe("levels", () => {
  it("starts at 1 and steps up every 3 points from 28", () => {
    expect(levelForScore(0)).toBe(1);
    expect(levelForScore(INITIAL_RATING)).toBe(1);
    expect(levelForScore(27.9)).toBe(1);
    expect(levelForScore(28)).toBe(2);
    expect(levelForScore(30.9)).toBe(2);
    expect(levelForScore(31)).toBe(3);
    expect(levelForScore(96.9)).toBe(24);
    expect(levelForScore(97)).toBe(MAX_SPEAKER_LEVEL);
    expect(levelForScore(100)).toBe(MAX_SPEAKER_LEVEL);
    expect(MAX_SPEAKER_LEVEL).toBe(25);
  });

  it("says where the next level starts", () => {
    expect(nextLevelAt(1)).toBe(28);
    expect(nextLevelAt(2)).toBe(31);
    expect(nextLevelAt(24)).toBe(97);
    expect(nextLevelAt(25)).toBeNull();
  });
});

describe("a single attempt", () => {
  it("has the plan's words", () => {
    expect(attemptLabel(100)).toBe("Great");
    expect(attemptLabel(80)).toBe("Great");
    expect(attemptLabel(79)).toBe("Solid");
    expect(attemptLabel(60)).toBe("Solid");
    expect(attemptLabel(59)).toBe("Getting there");
    expect(attemptLabel(40)).toBe("Getting there");
    expect(attemptLabel(39)).toBe("Keep going");
    expect(attemptLabel(0)).toBe("Keep going");
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
    const goodAt: Record<number, number> = {};
    for (let day = 1; day <= 120; day++) {
      ability += growthPerDay;
      for (let i = 0; i < 4; i++) {
        const ok = random() < expectedScore(ability, level);
        const score = ok ? 0.8 + random() * 0.2 : 0.3 + random() * 0.3;
        state = updateRating(state, score, level);
        level = nextDifficulty(level, ok);
        if (score >= 0.7) for (const d of [3, 5, 6]) if (level >= d) goodAt[d] = (goodAt[d] ?? 0) + 1;
        stage = earnedStage(stage, state.rating, { attempts: state.attempts, goodAt });
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
