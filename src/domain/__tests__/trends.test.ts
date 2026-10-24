import { computeThisWeekVsLastWeek, hasLayer, scorePointOf } from "../trends";
import type { TakeScores } from "../scoring/takeScore";

const sheet = (layer: "measured" | "judged", overall: number, cadence: number) => ({
  layer,
  overall,
  categories: [{ skill: "cadence" as const, label: "Cadence", score: cadence, weight: 1, subscores: [] }],
});

const scores = (measured: number | null, judged: number | null): TakeScores => ({
  version: 5,
  measured: measured != null ? sheet("measured", measured, measured) : null,
  judged: judged != null ? sheet("judged", judged, judged) : null,
  headline: judged != null ? "judged" : "measured",
});

describe("score trends by layer", () => {
  const today = new Date("2026-10-23T12:00:00");
  const points = [
    scorePointOf("2026-10-22T12:00:00", scores(6, null)),
    scorePointOf("2026-10-21T12:00:00", scores(7, 5)),
    scorePointOf("2026-10-14T12:00:00", scores(5, null)),
  ];

  it("keeps the layers apart: a take without a judgement is not in the judged week", () => {
    const judged = computeThisWeekVsLastWeek(points, "judged", today);
    expect(judged.thisWeek).toMatchObject({ sessionCount: 1, overall: 5 });
    expect(judged.lastWeek.sessionCount).toBe(0);
    const measured = computeThisWeekVsLastWeek(points, "measured", today);
    expect(measured.thisWeek).toMatchObject({ sessionCount: 2, overall: 6.5 });
    expect(measured.lastWeek.overall).toBe(5);
  });

  it("averages each skill within the layer", () => {
    expect(computeThisWeekVsLastWeek(points, "measured", today).thisWeek.bySkill.cadence).toBe(6.5);
    expect(computeThisWeekVsLastWeek(points, "measured", today).thisWeek.bySkill.confidence).toBeNull();
  });

  it("knows which layers exist", () => {
    expect(hasLayer(points, "judged")).toBe(true);
    expect(hasLayer([points[0]], "judged")).toBe(false);
  });
});
