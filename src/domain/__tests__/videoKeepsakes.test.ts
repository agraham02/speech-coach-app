import { planVideoCleanup, type VideoCandidate } from "../videoKeepsakes";

function video(id: string, recordedAt: string, extra: Partial<VideoCandidate> = {}): VideoCandidate {
  return { id, recordedAt, sessionType: "spontaneous", durationSeconds: 60, score: null, keepsake: false, ...extra };
}

const CUTOFF = "2026-09-09T12:00:00.000Z";

describe("planVideoCleanup", () => {
  it("keeps the best take of each month, and the toughest, and deletes the rest", () => {
    const plan = planVideoCleanup(
      [
        video("a", "2026-07-03T15:00:00.000Z", { score: 6 }),
        video("b", "2026-07-20T15:00:00.000Z", { score: 8 }),
        video("m", "2026-07-25T15:00:00.000Z", { score: 7 }),
        video("c", "2026-08-02T15:00:00.000Z"),
        video("d", "2026-08-10T15:00:00.000Z", { durationSeconds: 120 }),
      ],
      CUTOFF,
    );
    // July: best (b) and toughest (a); August has no scores, so just the best.
    expect(plan.keep.sort()).toEqual(["a", "b", "d"]);
    expect(plan.delete.sort()).toEqual(["c", "m"]);
  });

  it("keeps no toughest take when there's nothing to set against the best", () => {
    // One scored take, or takes that scored the same: no before and after.
    expect(planVideoCleanup([video("only", "2026-07-03T15:00:00.000Z", { score: 6 })], CUTOFF)).toEqual({ keep: ["only"], delete: [] });
    const tie = planVideoCleanup([video("a", "2026-07-03T15:00:00.000Z", { score: 6 }), video("b", "2026-07-20T15:00:00.000Z", { score: 6 })], CUTOFF);
    expect(tie.keep).toHaveLength(1);
    expect(tie.delete).toHaveLength(1);
  });

  it("doesn't pick a script reading, or an unscored take, as the toughest", () => {
    const plan = planVideoCleanup(
      [
        video("best", "2026-07-03T15:00:00.000Z", { score: 8 }),
        video("script", "2026-07-04T15:00:00.000Z", { sessionType: "script_practice", score: 2 }),
        video("unscored", "2026-07-05T15:00:00.000Z"),
      ],
      CUTOFF,
    );
    expect(plan.keep).toEqual(["best"]);
    expect(plan.delete.sort()).toEqual(["script", "unscored"]);
  });

  it("adds the toughest to a month that already has one keepsake, but never a third", () => {
    const plan = planVideoCleanup(
      [
        video("pinned", "2026-07-03T15:00:00.000Z", { keepsake: true, score: 8 }),
        video("low", "2026-07-10T15:00:00.000Z", { score: 3 }),
        video("mid", "2026-07-12T15:00:00.000Z", { score: 5 }),
      ],
      CUTOFF,
    );
    expect(plan.keep).toEqual(["low"]);
    expect(plan.delete).toEqual(["mid"]);
    const full = planVideoCleanup(
      [
        video("k1", "2026-07-03T15:00:00.000Z", { keepsake: true, score: 8 }),
        video("k2", "2026-07-04T15:00:00.000Z", { keepsake: true, score: 2 }),
        video("x", "2026-07-10T15:00:00.000Z", { score: 1 }),
      ],
      CUTOFF,
    );
    expect(full.keep).toEqual([]);
    expect(full.delete).toEqual(["x"]);
  });

  it("prefers a spoken rep over script reading", () => {
    const plan = planVideoCleanup(
      [video("s", "2026-07-03T15:00:00.000Z", { sessionType: "script_practice", score: 9 }), video("r", "2026-07-04T15:00:00.000Z", { score: 5 })],
      CUTOFF,
    );
    expect(plan.keep).toEqual(["r"]);
    expect(plan.delete).toEqual(["s"]);
  });

  it("respects an existing keepsake and doesn't pick another", () => {
    const plan = planVideoCleanup(
      [video("k", "2026-07-03T15:00:00.000Z", { keepsake: true }), video("x", "2026-07-20T15:00:00.000Z", { score: 10 })],
      CUTOFF,
    );
    expect(plan.keep).toEqual([]);
    expect(plan.delete).toEqual(["x"]);
  });

  it("can keep a newer video from the same month instead of an expiring one", () => {
    const plan = planVideoCleanup(
      [video("old", "2026-09-02T15:00:00.000Z", { score: 4 }), video("new", "2026-09-25T15:00:00.000Z", { score: 9 })],
      CUTOFF,
    );
    // The newer take is the best; the older, lower-scored one is the toughest.
    expect(plan.keep.sort()).toEqual(["new", "old"]);
    expect(plan.delete).toEqual([]);
  });

  it("leaves months with nothing expiring alone", () => {
    expect(planVideoCleanup([video("recent", "2026-10-01T15:00:00.000Z")], CUTOFF)).toEqual({ keep: [], delete: [] });
  });
});

describe("feeling takes", () => {
  it("are never picked as a month's keepsake", () => {
    const plan = planVideoCleanup(
      [
        { id: "f", recordedAt: "2026-08-03T10:00:00Z", sessionType: "feeling", durationSeconds: 120, score: null, keepsake: false },
        { id: "s", recordedAt: "2026-08-04T10:00:00Z", sessionType: "spontaneous", durationSeconds: 60, score: 4, keepsake: false },
      ],
      "2026-10-01T00:00:00Z",
    );
    expect(plan.keep).toEqual(["s"]);
    expect(plan.delete).toContain("f");
    // And never as the toughest either.
    const scoredFeeling = planVideoCleanup(
      [
        { id: "f2", recordedAt: "2026-08-03T10:00:00Z", sessionType: "feeling", durationSeconds: 120, score: 1, keepsake: false },
        { id: "s2", recordedAt: "2026-08-04T10:00:00Z", sessionType: "spontaneous", durationSeconds: 60, score: 6, keepsake: false },
      ],
      "2026-10-01T00:00:00Z",
    );
    expect(scoredFeeling.keep).toEqual(["s2"]);
  });
});
