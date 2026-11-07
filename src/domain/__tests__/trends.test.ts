import { computeThisWeekVsLastWeek, hasLine, scorePointOf } from "../trends";
import type { TakeScores } from "../scoring/takeScore";

const scores = (delivery: number, message: number | null): TakeScores => ({
  version: 8,
  score: message != null ? Math.round(delivery * 0.6 + message * 0.4) : delivery,
  headline: message != null ? "overall" : "delivery",
  delivery,
  message,
  pillars: [{ id: "voice", name: "Voice", score: delivery, share: 1, skills: [] }],
});

describe("score trends, Delivery and Message", () => {
  const today = new Date("2026-10-23T12:00:00");
  const points = [
    scorePointOf("2026-10-22T12:00:00", scores(60, null)),
    scorePointOf("2026-10-21T12:00:00", scores(70, 50)),
    scorePointOf("2026-10-14T12:00:00", scores(50, null)),
  ];

  it("gives everyone a Delivery line, and a take without a judgement isn't in the Message line", () => {
    const message = computeThisWeekVsLastWeek(points, "message", today);
    expect(message.thisWeek).toMatchObject({ sessionCount: 1, score: 50 });
    expect(message.lastWeek.sessionCount).toBe(0);
    const delivery = computeThisWeekVsLastWeek(points, "delivery", today);
    expect(delivery.thisWeek).toMatchObject({ sessionCount: 2, score: 65 });
    expect(delivery.lastWeek.score).toBe(50);
  });

  it("averages each pillar under Delivery", () => {
    expect(computeThisWeekVsLastWeek(points, "delivery", today).thisWeek.byPillar.voice).toBe(65);
    expect(computeThisWeekVsLastWeek(points, "delivery", today).thisWeek.byPillar.presence).toBeNull();
    expect(computeThisWeekVsLastWeek(points, "message", today).thisWeek.byPillar).toEqual({});
  });

  it("knows which lines exist", () => {
    expect(hasLine(points, "message")).toBe(true);
    expect(hasLine([points[0]], "message")).toBe(false);
    expect(hasLine([points[0]], "delivery")).toBe(true);
  });
});
