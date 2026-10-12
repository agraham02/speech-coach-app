import { loudnessRange, moveItPlan, pitchRangeSemitones, scoreMoveIt } from "../cadence/moveIt";

describe("Move It", () => {
  it("starts with the classic three movements and ends on a still take", () => {
    const plan = moveItPlan(1, 0);
    expect(plan.takes.map((t) => t.movementId ?? t.kind)).toEqual(["neutral", "punch", "wring", "point", "ghost"]);
  });

  it("hands more of the energy to you as the level rises", () => {
    expect(moveItPlan(5, 3).takes.filter((t) => t.kind === "move")).toHaveLength(2);
    expect(moveItPlan(9, 3).takes.filter((t) => t.kind === "move")).toHaveLength(1);
    expect(moveItPlan(9, 3).targetLift).toBeGreaterThan(moveItPlan(1, 3).targetLift);
    expect(moveItPlan(9, 3).lineCategory).toBe("story");
  });

  it("measures loudness range from voiced readings only", () => {
    const readings = [-1, -1, 2, 3, 4, 5, 6, 7, 8, -1].map((value) => ({ value }));
    expect(loudnessRange(readings)).toBe(4);
    expect(loudnessRange([{ value: -1 }, { value: 2 }])).toBeNull();
  });

  it("measures pitch range in semitones and ignores octave errors", () => {
    // an octave (110 → 220 Hz) is 12 semitones
    const contour = [110, 110, 120, 150, 180, 220, 220, null, 900];
    expect(pitchRangeSemitones(contour)).toBe(12);
  });

  it("scores the still take against the plain one, not against an ideal", () => {
    const passed = scoreMoveIt({ loudness: 2, pitch: 4 }, { loudness: 3, pitch: 6 }, 0.13)!;
    expect(passed.measure).toBe("pitch");
    expect(passed.lift).toBe(1.5);
    expect(passed.outcome.success).toBe(true);
    const flat = scoreMoveIt({ loudness: 2, pitch: null }, { loudness: 2, pitch: null }, 0.13)!;
    expect(flat.measure).toBe("loudness");
    expect(flat.outcome.success).toBe(false);
    expect(scoreMoveIt({ loudness: null, pitch: null }, { loudness: 3, pitch: 5 }, 0.13)).toBeNull();
  });
});
