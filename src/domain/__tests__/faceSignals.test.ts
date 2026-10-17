import type { FaceLandmarkerFace } from "vision-camera-face-landmarker";
import { headPoseFromMatrix, sampleFromFace } from "../faceSignals";
import { computePresenceMetrics, type PresenceSample } from "../presenceMetrics";

const RAD = Math.PI / 180;

// Rotation about the vertical axis (yaw) plus a translation 40 units away.
function yawMatrix(deg: number, layout: "row" | "column"): number[] {
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  const rows = [
    [c, 0, s, 1],
    [0, 1, 0, 2],
    [-s, 0, c, -40],
    [0, 0, 0, 1],
  ];
  return layout === "row" ? rows.flat() : [0, 1, 2, 3].flatMap((col) => rows.map((r) => r[col]));
}

function face(blendshapes: Record<string, number>, matrix: number[] = yawMatrix(0, "row")): FaceLandmarkerFace {
  return { width: 480, height: 640, bounds: [0.3, 0.3, 0.7, 0.7], landmarks: [], blendshapes, matrix };
}

describe("headPoseFromMatrix", () => {
  it("reads the same yaw from row- and column-major matrices", () => {
    expect(headPoseFromMatrix(yawMatrix(25, "row"))!.yaw).toBeCloseTo(25, 5);
    expect(headPoseFromMatrix(yawMatrix(25, "column"))!.yaw).toBeCloseTo(25, 5);
    expect(headPoseFromMatrix(yawMatrix(0, "column"))).toMatchObject({ yaw: 0, pitch: 0, roll: 0 });
  });

  it("rejects malformed input", () => {
    expect(headPoseFromMatrix([])).toBeNull();
  });
});

describe("sampleFromFace", () => {
  it("maps blendshapes to gaze, smile and blinks", () => {
    const s = sampleFromFace(
      face({ eyeLookOutLeft: 0.6, eyeLookInRight: 0.6, eyeLookDownLeft: 0.2, eyeLookDownRight: 0.2, mouthSmileLeft: 0.8, mouthSmileRight: 0.6, eyeBlinkLeft: 0.1, eyeBlinkRight: 0.1 }),
      0,
      true,
    );
    expect(s.gazeX).toBeCloseTo(0.6);
    expect(s.gazeY).toBeCloseTo(-0.2);
    expect(s.smile).toBeCloseTo(0.7);
    expect(s.eyesOpen).toBeCloseTo(0.9);
  });
});

describe("sampleFromFace invertGazeY", () => {
  const looksUp = face({ eyeLookUpLeft: 0.5, eyeLookUpRight: 0.5 });
  it("keeps up positive by default", () => {
    expect(sampleFromFace(looksUp, 0, true).gazeY).toBeCloseTo(0.5);
  });
  it("flips the vertical gaze when asked, without touching gazeX", () => {
    const s = sampleFromFace(face({ eyeLookUpLeft: 0.5, eyeLookUpRight: 0.5, eyeLookOutLeft: 0.4, eyeLookInRight: 0.4 }), 0, true, { invertGazeY: true });
    expect(s.gazeY).toBeCloseTo(-0.5);
    expect(s.gazeX).toBeCloseTo(0.4);
  });
  it("never returns negative zero", () => {
    expect(Object.is(sampleFromFace(face({}), 0, true, { invertGazeY: true }).gazeY, 0)).toBe(true);
  });
});

describe("computePresenceMetrics with gaze", () => {
  const sample = (tMs: number, gazeX: number, extra: Partial<PresenceSample> = {}): PresenceSample => ({
    tMs,
    present: true,
    yaw: 0,
    pitch: 0,
    roll: 0,
    smile: 0.1,
    eyesOpen: 0.9,
    framed: true,
    gazeX,
    gazeY: 0,
    browRaise: 0,
    browDown: 0,
    jawOpen: 0.1,
    mouthPress: 0,
    ...extra,
  });

  it("counts wandering eyes as lost eye contact even with the head still", () => {
    const timeline = [
      ...Array.from({ length: 30 }, (_, i) => sample(i * 200, 0)),
      ...Array.from({ length: 30 }, (_, i) => sample(6000 + i * 200, 0.7)),
    ];
    const m = computePresenceMetrics(timeline)!;
    expect(m.eyeContactSource).toBe("gaze");
    expect(m.eyeContactPercent).toBe(50);
    expect(m.facingLensPercent).toBe(100);
    expect(m.longestLookAwayMs).toBe(5800);
  });

  it("doesn't count a blink as looking away", () => {
    const timeline = Array.from({ length: 10 }, (_, i) => sample(i * 200, 0, i === 5 ? { eyesOpen: 0.1, gazeY: -0.6 } : {}));
    const m = computePresenceMetrics(timeline)!;
    expect(m.eyeContactPercent).toBe(100);
    expect(m.lookingDownPercent).toBe(0);
  });

  it("measures head tilt and looking down", () => {
    const timeline = Array.from({ length: 10 }, (_, i) => sample(i * 200, 0, { roll: i < 6 ? 18 : 2, gazeY: i < 3 ? -0.5 : 0 }));
    const m = computePresenceMetrics(timeline)!;
    expect(m.tiltedPercent).toBe(60);
    expect(m.lookingDownPercent).toBe(30);
  });

  it("keeps working on old head-pose-only timelines", () => {
    const old = Array.from({ length: 5 }, (_, i) => ({ tMs: i * 200, present: true, yaw: 2, pitch: 0, smile: 0.1, eyesOpen: 0.9, framed: true }));
    const m = computePresenceMetrics(old)!;
    expect(m.eyeContactSource).toBe("head");
    expect(m.eyeContactPercent).toBe(100);
    expect(m.lookingDownPercent).toBeUndefined();
  });
});
