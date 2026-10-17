import type { FaceLandmarkerFace } from "vision-camera-face-landmarker";
import { headPoseFromMatrix, sampleFromFace } from "../faceSignals";
import type { OrientedFace } from "../faceOrientation";

const RAD = Math.PI / 180;
type M3 = number[][];

const mul = (a: M3, b: M3): M3 => a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
const rx = (deg: number): M3 => [[1, 0, 0], [0, Math.cos(deg * RAD), -Math.sin(deg * RAD)], [0, Math.sin(deg * RAD), Math.cos(deg * RAD)]];
const ry = (deg: number): M3 => [[Math.cos(deg * RAD), 0, Math.sin(deg * RAD)], [0, 1, 0], [-Math.sin(deg * RAD), 0, Math.cos(deg * RAD)]];
const rz = (deg: number): M3 => [[Math.cos(deg * RAD), -Math.sin(deg * RAD), 0], [Math.sin(deg * RAD), Math.cos(deg * RAD), 0], [0, 0, 1]];

// Row-major 4x4 with the face 40 units from the lens in the last column.
const rowMajor = (rot: M3): number[] => [rot[0][0], rot[0][1], rot[0][2], 1, rot[1][0], rot[1][1], rot[1][2], 2, rot[2][0], rot[2][1], rot[2][2], -40, 0, 0, 0, 1];

describe("headPoseFromMatrix without a quarter turn", () => {
  it("is unchanged for an upright frame", () => {
    const pose = headPoseFromMatrix(rowMajor(mul(ry(20), rx(0))))!;
    expect(pose.yaw).toBeCloseTo(20, 4);
    expect(pose.roll).toBeCloseTo(0, 4);
  });
});

describe("headPoseFromMatrix in the sideways camera frame", () => {
  // A head turned 20 degrees and nodded 10, seen from a camera frame that is
  // rotated a quarter turn either way.
  const upright = mul(ry(20), rx(10));

  for (const turn of [90, -90]) {
    it("reads a level head as level when the frame is turned " + turn + " degrees", () => {
      const sideways = rowMajor(mul(rz(turn), upright));
      const raw = headPoseFromMatrix(sideways)!;
      expect(Math.abs(Math.abs(raw.roll) - 90)).toBeLessThan(15);

      const fixed = headPoseFromMatrix(sideways, true)!;
      expect(fixed.roll).toBeCloseTo(0, 3);
      expect(fixed.yaw).toBeCloseTo(20, 3);
      expect(fixed.pitch).toBeCloseTo(10, 3);
    });
  }

  it("keeps a real head tilt", () => {
    const tilted = mul(rz(15), upright);
    const fixed = headPoseFromMatrix(rowMajor(mul(rz(90), tilted)), true)!;
    expect(Math.abs(fixed.roll)).toBeCloseTo(15, 0);
  });
});

describe("sampleFromFace pose", () => {
  const upright = mul(ry(0), rx(0));
  const base: FaceLandmarkerFace = { width: 1080, height: 1920, bounds: [0.3, 0.3, 0.7, 0.7], landmarks: [], blendshapes: {}, matrix: rowMajor(mul(rz(90), upright)) };

  it("uses the raw pose when the face was not found sideways", () => {
    const sample = sampleFromFace({ ...base, axes: { swap: false, flipX: false, flipY: false } } as OrientedFace, 0, true);
    expect(Math.abs(Math.abs(sample.roll!) - 90)).toBeLessThan(15);
  });

  it("turns the pose upright when the landmarks were found sideways", () => {
    const sample = sampleFromFace({ ...base, axes: { swap: true, flipX: false, flipY: true } } as OrientedFace, 0, true);
    expect(sample.roll).toBeCloseTo(0, 3);
    expect(sample.yaw).toBeCloseTo(0, 3);
  });
});
