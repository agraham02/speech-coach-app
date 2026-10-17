import type { FaceLandmarkerFace } from "vision-camera-face-landmarker";
import type { OrientedFace } from "./faceOrientation";
import type { PresenceSample } from "./presenceMetrics";

// Turns one MediaPipe Face Landmarker result into a PresenceSample. Pure, so
// the mapping (and its sign conventions) is unit-tested rather than trusted.

export interface HeadPose {
  yaw: number; // degrees, 0 = facing the camera
  pitch: number;
  roll: number; // head tilt toward a shoulder
}

const DEG = 180 / Math.PI;

// The facial transformation matrix's rotation part as yaw/pitch/roll. The
// native side sends iOS matrices row-major and Android ones column-major;
// the translation (the face is tens of cm from the lens, so it's never 0)
// sits in the last column either way, which tells the two apart.
//
// quarterTurn: the matrix is in the raw sideways camera frame (iOS reports
// landmarks and pose that way; see faceOrientation.ts), so a level head reads
// as rolled by about 90 degrees and yaw and pitch trade places. Turning the
// camera frame a quarter turn about the viewing axis, whichever way leaves
// the smaller roll, puts the pose upright.
export function headPoseFromMatrix(m: number[], quarterTurn = false): HeadPose | null {
  if (m.length !== 16) return null;
  const columnMajor = Math.abs(m[12]) + Math.abs(m[13]) + Math.abs(m[14]) > Math.abs(m[3]) + Math.abs(m[7]) + Math.abs(m[11]);
  const r = (row: number, col: number) => (columnMajor ? m[col * 4 + row] : m[row * 4 + col]);
  const euler = (rot: number[][]): HeadPose => ({
    pitch: Math.atan2(rot[2][1], rot[2][2]) * DEG,
    yaw: Math.asin(Math.max(-1, Math.min(1, -rot[2][0]))) * DEG,
    roll: Math.atan2(rot[1][0], rot[0][0]) * DEG,
  });
  const rows = [0, 1, 2].map((row) => [0, 1, 2].map((col) => r(row, col)));
  let pose = euler(rows);
  if (quarterTurn) {
    // Rz(+90) and Rz(-90) applied to the rotation: new row 0 is -row 1 or
    // row 1, new row 1 is row 0 or -row 0.
    const plus = euler([rows[1].map((v) => -v), rows[0], rows[2]]);
    const minus = euler([rows[1], rows[0].map((v) => -v), rows[2]]);
    pose = Math.abs(plus.roll) <= Math.abs(minus.roll) ? plus : minus;
  }
  if (![pose.pitch, pose.yaw, pose.roll].every(Number.isFinite)) return null;
  return pose;
}

// Fallback from landmarks when there's no matrix: yaw from the depth
// difference across the face, roll from the eye line. No pitch estimate.
function headPoseFromLandmarks(face: FaceLandmarkerFace): HeadPose | null {
  const p = (i: number) => ({ x: face.landmarks[i * 3] * face.width, y: face.landmarks[i * 3 + 1] * face.height, z: face.landmarks[i * 3 + 2] * face.width });
  if (face.landmarks.length < 21) return null;
  // Indices into LANDMARK_INDICES order: 3 = face edge right, 4 = face edge
  // left, 5 = outer right eye, 6 = outer left eye.
  const edgeR = p(3);
  const edgeL = p(4);
  const eyeR = p(5);
  const eyeL = p(6);
  return {
    yaw: Math.atan2(edgeL.z - edgeR.z, edgeL.x - edgeR.x) * DEG,
    pitch: 0,
    roll: Math.atan2(eyeL.y - eyeR.y, eyeL.x - eyeR.x) * DEG,
  };
}

// Positions in the plugin landmark array (LANDMARK_INDICES order).
const NOSE_TIP = 0;
const CHIN = 2;
const EDGE_RIGHT = 3;
const EDGE_LEFT = 4;
const BETWEEN_EYES = 7;

export interface HeadProxies {
  // Nose tip's drop below the eyes, as a share of eyes-to-chin. Larger when
  // the chin tips down, smaller when it tips up (the nose sticks out, so it
  // swings further than the chin). Compare it with your own level head.
  tip: number;
  // Nose tip's sideways offset from the middle of the face, as a share of
  // face width. Positive when the nose points toward the screen right,
  // which on the mirrored preview is the user's right.
  turn: number;
}

// Head pitch and turn from the landmarks alone, in the upright preview
// coordinates orientFace gives. Unlike the matrix angles, which way they point
// follows from the picture, not from a sign convention. Null without them.
export function headProxies(face: FaceLandmarkerFace | OrientedFace): HeadProxies | null {
  const l = face.landmarks;
  if (l.length < (BETWEEN_EYES + 1) * 3) return null;
  const x = (i: number) => l[i * 3];
  const y = (i: number) => l[i * 3 + 1];
  const width = x(EDGE_LEFT) - x(EDGE_RIGHT);
  const height = y(CHIN) - y(BETWEEN_EYES);
  if (!(width > 0.01) || !(height > 0.01)) return null;
  const tip = (y(NOSE_TIP) - y(BETWEEN_EYES)) / height;
  const turn = (x(NOSE_TIP) - (x(EDGE_RIGHT) + x(EDGE_LEFT)) / 2) / width;
  return Number.isFinite(tip) && Number.isFinite(turn) ? { tip, turn } : null;
}

const avg = (...values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

// How shut the eyes are, 0 open to 1 closed (MediaPipe's blink blendshapes).
export function eyeClosure(face: FaceLandmarkerFace | OrientedFace): number {
  return avg(face.blendshapes.eyeBlinkLeft ?? 0, face.blendshapes.eyeBlinkRight ?? 0);
}

export interface SampleOptions {
  // Flip the vertical gaze: the iOS front camera reports it upside down.
  invertGazeY?: boolean;
}

export function sampleFromFace(face: FaceLandmarkerFace | OrientedFace, tMs: number, framed: boolean, opts: SampleOptions = {}): PresenceSample {
  const b = (name: string) => face.blendshapes[name] ?? 0;
  const sideways = "axes" in face && !!face.axes?.swap;
  const pose = headPoseFromMatrix(face.matrix, sideways) ?? headPoseFromLandmarks(face) ?? { yaw: 0, pitch: 0, roll: 0 };
  return {
    tMs,
    present: true,
    yaw: pose.yaw,
    pitch: pose.pitch,
    roll: pose.roll,
    smile: avg(b("mouthSmileLeft"), b("mouthSmileRight")),
    eyesOpen: 1 - eyeClosure(face),
    framed,
    // Eyes relative to the head, -1..1. Positive x = toward MediaPipe's left,
    // which on the iOS front camera (a mirrored image) is the user's physical
    // right; positive y = up (after invertGazeY, where the platform needs it).
    gazeX: avg(b("eyeLookOutLeft") - b("eyeLookInLeft"), b("eyeLookInRight") - b("eyeLookOutRight")),
    gazeY: (opts.invertGazeY ? -1 : 1) * (avg(b("eyeLookUpLeft"), b("eyeLookUpRight")) - avg(b("eyeLookDownLeft"), b("eyeLookDownRight"))) || 0,
    browRaise: Math.max(b("browInnerUp"), avg(b("browOuterUpLeft"), b("browOuterUpRight"))),
    browDown: avg(b("browDownLeft"), b("browDownRight")),
    jawOpen: b("jawOpen"),
    mouthPress: avg(b("mouthPressLeft"), b("mouthPressRight")),
  };
}
