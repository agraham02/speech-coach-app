import type { FaceLandmarkerFace } from "vision-camera-face-landmarker";
import { ALL_FACE_AXES, applyFaceAxes, describeFaceAxes, fitFaceAxes, orientFace } from "../faceOrientation";

// An upright face as the mirrored selfie preview shows it, in LANDMARK_INDICES
// order: nose, forehead, chin, edge R, edge L, eye R, eye L, brow, lip up,
// lip down. MediaPipe's right side (edge R, eye R) is on the screen left:
// the image it sees is mirrored.
const UPRIGHT: [number, number][] = [
  [0.5, 0.5],
  [0.5, 0.3],
  [0.5, 0.72],
  [0.32, 0.48],
  [0.68, 0.48],
  [0.38, 0.42],
  [0.62, 0.42],
  [0.5, 0.42],
  [0.5, 0.58],
  [0.5, 0.6],
];

function faceFrom(points: [number, number][], bounds: [number, number, number, number]): FaceLandmarkerFace {
  return { width: 1920, height: 1080, bounds, landmarks: points.flatMap(([x, y]) => [x, y, 0]), blendshapes: {}, matrix: [] };
}

describe("fitFaceAxes", () => {
  it("leaves an upright face as it is", () => {
    const fit = fitFaceAxes(faceFrom(UPRIGHT, [0.3, 0.25, 0.7, 0.75]).landmarks)!;
    expect(fit.axes).toEqual({ swap: false, flipX: false, flipY: false });
    expect(fit.score).toBeCloseTo(2);
  });

  it("undoes every rotation and flip", () => {
    for (const turn of ALL_FACE_AXES) {
      const reported = UPRIGHT.map(([x, y]) => applyFaceAxes(turn, x, y));
      const fit = fitFaceAxes(faceFrom(reported, [0, 0, 1, 1]).landmarks)!;
      reported.forEach(([x, y], i) => {
        const [ux, uy] = applyFaceAxes(fit.axes, x, y);
        expect(ux).toBeCloseTo(UPRIGHT[i][0]);
        expect(uy).toBeCloseTo(UPRIGHT[i][1]);
      });
    }
  });

  it("is null without enough landmarks", () => {
    expect(fitFaceAxes([0.5, 0.5, 0])).toBeNull();
  });
});

describe("orientFace", () => {
  it("turns a sideways (transposed) face upright, box included, in portrait size", () => {
    const transposed = UPRIGHT.map(([x, y]) => [y, x] as [number, number]);
    const face = orientFace(faceFrom(transposed, [0.25, 0.3, 0.75, 0.7]));
    expect(face.width).toBe(1080);
    expect(face.height).toBe(1920);
    expect(face.axes?.swap).toBe(true);
    expect(face.landmarks[3]).toBeCloseTo(UPRIGHT[1][0]);
    expect(face.landmarks[4]).toBeCloseTo(UPRIGHT[1][1]);
    expect(face.bounds[0]).toBeCloseTo(0.3);
    expect(face.bounds[1]).toBeCloseTo(0.25);
    expect(face.bounds[2]).toBeCloseTo(0.7);
    expect(face.bounds[3]).toBeCloseTo(0.75);
  });

  it("keeps blendshapes, matrix and depth untouched", () => {
    const base = faceFrom(UPRIGHT, [0.3, 0.25, 0.7, 0.75]);
    const face = orientFace({ ...base, blendshapes: { jawOpen: 0.4 }, matrix: [1, 2], landmarks: base.landmarks.map((v, i) => (i % 3 === 2 ? 0.07 : v)) });
    expect(face.blendshapes).toEqual({ jawOpen: 0.4 });
    expect(face.matrix).toEqual([1, 2]);
    expect(face.landmarks[2]).toBe(0.07);
  });

  it("describes what it did", () => {
    expect(describeFaceAxes({ swap: false, flipX: false, flipY: false })).toBe("as reported");
    expect(describeFaceAxes({ swap: true, flipX: false, flipY: true })).toBe("swap x/y, flip y");
  });
});
