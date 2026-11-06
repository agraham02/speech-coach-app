import type { FaceCalibration } from "../faceCalibration";
import { faceMovement } from "../faceMovement";
import { NO_FACE, animatedFace, lookingAtLens, stillFace, timeline, withFaceEvents } from "./faceTimeline";

const calibration = (over: Partial<FaceCalibration> = {}): FaceCalibration => ({
  version: 1,
  at: "2026-11-06T10:00:00Z",
  platform: "ios",
  center: { gazeX: 0, gazeY: 0, yaw: 0, pitch: 0 },
  rest: { smile: 0.05, browRaise: 0.05 },
  peaks: { smile: 0.5, brows: 0.5 },
  ...over,
});

describe("faceMovement", () => {
  it("is null on a timeline too short, or with no face", () => {
    expect(faceMovement([], null)).toBeNull();
    expect(faceMovement(lookingAtLens(0.1), null)).toBeNull();
    expect(faceMovement(timeline([{ sec: 5, over: NO_FACE }]), null)).toBeNull();
  });

  it("finds nothing in a still face, whose jitter is smaller than any movement", () => {
    const m = faceMovement(stillFace(20), null)!;
    expect(m.events).toEqual([]);
    expect(m.browLiftsPerMinute).toBe(0);
    expect(m.smilesPerMinute).toBe(0);
    expect(m.motionIndex).toBe(0);
    expect(m.reference.smile.usable).toBe(false);
  });

  it("uses a good share of its own range in an animated face", () => {
    const still = faceMovement(stillFace(20), null)!;
    const animated = faceMovement(animatedFace(20), null)!;
    expect(animated.motionIndex).toBeGreaterThan(40);
    expect(animated.motionIndex).toBeGreaterThan(still.motionIndex + 40);
    expect(animated.browLiftsPerMinute).toBeGreaterThan(0);
    expect(animated.smilesPerMinute).toBeGreaterThan(0);
  });

  it("finds each brow lift and smile on cue, with the time it began", () => {
    const frames = withFaceEvents(10, [
      { kind: "brow", atMs: 1000, durMs: 600 },
      { kind: "smile", atMs: 5000, durMs: 800 },
      { kind: "brow", atMs: 8000, durMs: 400 },
    ]);
    const m = faceMovement(frames, null)!;
    expect(m.events).toEqual([
      { tMs: 1000, kind: "brow" },
      { tMs: 5000, kind: "smile" },
      { tMs: 8000, kind: "brow" },
    ]);
    expect(m.browLiftsPerMinute).toBeCloseTo(12, 0);
    expect(m.smilesPerMinute).toBeCloseTo(6, 0);
  });

  it("ignores a rise shorter than 150 ms and keeps one held for 150 ms", () => {
    const quick = faceMovement(
      withFaceEvents(20, [
        { kind: "brow", atMs: 3000, durMs: 100 },
        { kind: "smile", atMs: 6000, durMs: 150 },
        // A long one gives the take a range to measure against.
        { kind: "brow", atMs: 10000, durMs: 2000 },
        { kind: "smile", atMs: 14000, durMs: 2000 },
      ]),
      null,
    )!;
    expect(quick.events.map((e) => e.tMs)).toEqual([6000, 10000, 14000]);
  });

  it("counts a lift once when the value wobbles around the halfway line", () => {
    const frames = timeline([
      { sec: 5 },
      { sec: 3, over: (i) => ({ browRaise: i % 2 ? 0.45 : 0.38 }) },
      { sec: 1, over: { browRaise: 0.7 } },
      { sec: 5 },
    ]);
    expect(faceMovement(frames, null)!.events.filter((e) => e.kind === "brow")).toHaveLength(1);
  });

  it("does not let a lost face count towards a hold", () => {
    const frames = timeline([{ sec: 3 }, { sec: 0.2, over: { browRaise: 0.7 } }, { sec: 0.1, over: NO_FACE }, { sec: 0.2, over: { browRaise: 0.7 } }, { sec: 3 }, { sec: 1, over: { browRaise: 0.7 } }]);
    expect(faceMovement(frames, null)!.events.map((e) => e.kind)).toEqual(["brow", "brow", "brow"]);
  });

  describe("against the face check", () => {
    it("uses the face check's rest and strongest rise instead of the take's percentiles", () => {
      // The take only ever reaches 0.45 on the brows, yet the person's own
      // peak is 0.9: halfway is 0.475, so that lift doesn't count.
      const frames = withFaceEvents(10, [{ kind: "brow", atMs: 4000, durMs: 1500 }], 0.45);
      expect(faceMovement(frames, null)!.events).toHaveLength(1);
      const m = faceMovement(frames, calibration({ peaks: { smile: 0.5, brows: 0.85 } }))!;
      expect(m.reference.brow).toMatchObject({ source: "calibration", rest: 0.05, peak: 0.9, usable: true });
      expect(m.events).toEqual([]);
    });

    it("finds a smile in a face that rests high, which the take alone can't see against its own flat range", () => {
      const frames = timeline([{ sec: 10, over: { smile: 0.3 } }, { sec: 1, over: { smile: 0.6 } }, { sec: 19, over: { smile: 0.3 } }]);
      const alone = faceMovement(frames, null)!;
      expect(alone.reference.smile.usable).toBe(false);
      expect(alone.events).toEqual([]);
      const m = faceMovement(frames, calibration({ rest: { smile: 0.3, browRaise: 0.05 }, peaks: { smile: 0.3, brows: 0.5 } }))!;
      expect(m.events).toEqual([{ tMs: 10000, kind: "smile" }]);
    });

    it("falls back to the take for a channel the face check didn't try or barely moved", () => {
      const frames = withFaceEvents(10, [{ kind: "brow", atMs: 4000, durMs: 1500 }]);
      const m = faceMovement(frames, calibration({ peaks: { smile: 0.1 } }))!;
      expect(m.reference.smile.source).toBe("take");
      expect(m.reference.brow.source).toBe("take");
      expect(m.events).toHaveLength(1);
    });
  });
});
