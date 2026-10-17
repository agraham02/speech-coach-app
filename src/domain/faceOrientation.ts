import type { FaceLandmarkerFace } from "vision-camera-face-landmarker";

// The face plugin reports landmarks normalized to the camera buffer, which on
// iOS is the raw sideways frame rather than the upright picture on screen.
// Rather than hard-code that (and get it wrong for a camera or orientation
// it was not checked on), the face itself says which way is up: these work
// out, per frame, the rotation or flip that puts the chin below the forehead
// and MediaPipe's right eye (landmark 33) on the screen left.
//
// Why left: VisionCamera hands the plugin a mirrored front-camera image, so
// MediaPipe's "right eye" is the user's physical left eye, and the mirrored
// preview shows that on the screen left. Seen on an iPhone in the Face Lab
// (2026-10-16): with it on the right, the overlay moved opposite to the face.
// Not checked on Android.

export interface FaceAxes {
  // Exchange x and y, then mirror either axis.
  swap: boolean;
  flipX: boolean;
  flipY: boolean;
}

export const ALL_FACE_AXES: FaceAxes[] = [false, true].flatMap((swap) =>
  [false, true].flatMap((flipX) => [false, true].map((flipY) => ({ swap, flipX, flipY }))),
);

export function applyFaceAxes(axes: FaceAxes, x: number, y: number): [number, number] {
  let px = axes.swap ? y : x;
  let py = axes.swap ? x : y;
  if (axes.flipX) px = 1 - px;
  if (axes.flipY) py = 1 - py;
  return [px, py];
}

export function describeFaceAxes(axes: FaceAxes): string {
  const parts = [axes.swap ? "swap x/y" : "", axes.flipX ? "flip x" : "", axes.flipY ? "flip y" : ""].filter(Boolean);
  return parts.length ? parts.join(", ") : "as reported";
}

// Positions in the plugin landmark array (LANDMARK_INDICES order).
const FOREHEAD = 1;
const CHIN = 2;
const EYE_RIGHT = 5;
const EYE_LEFT = 6;

// The axes that best stand the face upright, with a score from -2 to 2
// (2: chin straight below the forehead and the eyes level, MediaPipe's right
// eye on the screen left).
export function fitFaceAxes(landmarks: number[]): { axes: FaceAxes; score: number } | null {
  if (landmarks.length < (EYE_LEFT + 1) * 3) return null;
  const at = (i: number): [number, number] => [landmarks[i * 3], landmarks[i * 3 + 1]];
  const raw = { forehead: at(FOREHEAD), chin: at(CHIN), right: at(EYE_RIGHT), left: at(EYE_LEFT) };
  if (![raw.forehead, raw.chin, raw.right, raw.left].every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))) return null;
  let best: { axes: FaceAxes; score: number } | null = null;
  for (const axes of ALL_FACE_AXES) {
    const [fx, fy] = applyFaceAxes(axes, ...raw.forehead);
    const [cx, cy] = applyFaceAxes(axes, ...raw.chin);
    const [rx, ry] = applyFaceAxes(axes, ...raw.right);
    const [lx, ly] = applyFaceAxes(axes, ...raw.left);
    const vertical = Math.hypot(cx - fx, cy - fy);
    const across = Math.hypot(lx - rx, ly - ry);
    const score = (vertical > 0 ? (cy - fy) / vertical : 0) + (across > 0 ? (lx - rx) / across : 0);
    if (!best || score > best.score) best = { axes, score };
  }
  return best;
}

export interface OrientedFace extends FaceLandmarkerFace {
  // How the reported coordinates were turned; absent if they could not be.
  axes?: FaceAxes;
  axesScore?: number;
}

// The face with its landmarks and box in upright selfie-preview coordinates
// (0-1), and the picture size as the portrait screen shows it.
export function orientFace(face: FaceLandmarkerFace): OrientedFace {
  const portrait = { width: Math.min(face.width, face.height), height: Math.max(face.width, face.height) };
  const fit = fitFaceAxes(face.landmarks);
  if (!fit) return { ...face, ...portrait };
  const landmarks: number[] = [];
  for (let i = 0; i + 2 < face.landmarks.length; i += 3) {
    const [x, y] = applyFaceAxes(fit.axes, face.landmarks[i], face.landmarks[i + 1]);
    landmarks.push(x, y, face.landmarks[i + 2]);
  }
  const [x0, y0, x1, y1] = face.bounds;
  const [ax, ay] = applyFaceAxes(fit.axes, x0, y0);
  const [bx, by] = applyFaceAxes(fit.axes, x1, y1);
  return {
    ...face,
    ...portrait,
    landmarks,
    bounds: [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)],
    axes: fit.axes,
    axesScore: fit.score,
  };
}
