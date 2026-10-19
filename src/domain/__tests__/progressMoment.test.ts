import { buildMoment, MAX_BEATS, scoreLine, type MomentInput } from "../progressMoment";

const base: MomentInput = { score: 7, previousScores: [6.5, 6, 6.2], previousBest: 7.5, moves: [] };

describe("score line", () => {
  it("says nothing on a first take", () => {
    expect(scoreLine(6, [])).toBeNull();
  });

  it("names a rise, with the average when the take beats it", () => {
    const line = scoreLine(7, [6.5, 6, 6.2])!;
    expect(line.direction).toBe("up");
    expect(line.title).toBe("Up 0.5 on your last take");
    expect(line.detail).toMatch(/recent average of 6.2/);
  });

  it("never shames a drop: it points at the trend", () => {
    const stillUp = scoreLine(6.8, [7.4, 6.6, 6.2, 6, 6.1])!;
    expect(stillUp.direction).toBe("down");
    expect(stillUp.title).toBe("Down 0.6 on your last take");
    expect(stillUp.detail).toMatch(/still up/);
    const short = scoreLine(5, [6])!;
    expect(short.detail).toMatch(/One take is noise/);
  });
});

describe("moment", () => {
  it("leads with a stage earned, and names the speaker level", () => {
    const beats = buildMoment({
      ...base,
      moves: [
        { skill: "cadence", ratingBefore: 33, ratingAfter: 36, stageBefore: 1, stageAfter: 2 },
        { skill: "impromptu", ratingBefore: 40, ratingAfter: 41 },
      ],
      speakerLevelBefore: 1,
      speakerLevelAfter: 2,
    });
    expect(beats[0]).toEqual({ kind: "stage", skill: "cadence", stage: 2, speakerLevel: 2 });
    const skills = beats.find((b) => b.kind === "skills");
    expect(skills && skills.kind === "skills" && skills.moves[0].progressBefore).toBe(0);
  });

  it("puts a personal best in place of the score line", () => {
    const beats = buildMoment({ ...base, score: 8 });
    expect(beats.map((b) => b.kind)).toEqual(["best"]);
  });

  it("drops tiny moves and keeps the biggest three", () => {
    const beats = buildMoment({
      ...base,
      moves: [
        { skill: "cadence", ratingBefore: 30, ratingAfter: 30.05 },
        { skill: "impromptu", ratingBefore: 30, ratingAfter: 33 },
        { skill: "confidence", ratingBefore: 30, ratingAfter: 28 },
        { skill: "conversation", ratingBefore: 30, ratingAfter: 31 },
        { skill: "articulation", ratingBefore: 30, ratingAfter: 30.5 },
      ],
    });
    const skills = beats.find((b) => b.kind === "skills");
    expect(skills?.kind === "skills" && skills.moves.map((m) => m.skill)).toEqual(["impromptu", "confidence", "conversation"]);
  });

  it("caps the beats", () => {
    const beats = buildMoment({
      ...base,
      score: 9,
      moves: [{ skill: "cadence", ratingBefore: 33, ratingAfter: 36, stageBefore: 1, stageAfter: 2 }],
      path: { unitTitle: "The power of the pause", lessonIndex: 2, lessonCount: 3 },
      streakDays: 4,
    });
    expect(beats.length).toBe(MAX_BEATS);
    expect(beats.map((b) => b.kind)).toEqual(["stage", "best", "skills", "path"]);
  });

  it("shows the goal only without a streak beat", () => {
    expect(buildMoment({ ...base, goal: { done: 2, goal: 3 } }).some((b) => b.kind === "goal")).toBe(true);
    expect(buildMoment({ ...base, goal: { done: 2, goal: 3 }, streakDays: 3 }).some((b) => b.kind === "goal")).toBe(false);
  });
});
