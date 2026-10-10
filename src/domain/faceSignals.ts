import type { FaceLandmarkerFace } from "vision-camera-face-landmarker";
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
export function headPoseFromMatrix(m: number[]): HeadPose | null {
  if (m.length !== 16) return null;
  const columnMajor = Math.abs(m[12]) + Math.abs(m[13]) + Math.abs(m[14]) > Math.abs(m[3]) + Math.abs(m[7]) + Math.abs(m[11]);
  const r = (row: number, col: number) => (columnMajor ? m[col * 4 + row] : m[row * 4 + col]);
  const pitch = Math.atan2(r(2, 1), r(2, 2)) * DEG;
  const yaw = Math.asin(Math.max(-1, Math.min(1, -r(2, 0)))) * DEG;
  const roll = Math.atan2(r(1, 0), r(0, 0)) * DEG;
  if (![pitch, yaw, roll].every(Number.isFinite)) return null;
  return { yaw, pitch, roll };
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

const avg = (...values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

export function sampleFromFace(face: FaceLandmarkerFace, tMs: number, framed: boolean): PresenceSample {
  const b = (name: string) => face.blendshapes[name] ?? 0;
  const pose = headPoseFromMatrix(face.matrix) ?? headPoseFromLandmarks(face) ?? { yaw: 0, pitch: 0, roll: 0 };
  return {
    tMs,
    present: true,
    yaw: pose.yaw,
    pitch: pose.pitch,
    roll: pose.roll,
    smile: avg(b("mouthSmileLeft"), b("mouthSmileRight")),
    eyesOpen: 1 - avg(b("eyeBlinkLeft"), b("eyeBlinkRight")),
    framed,
    // Eyes relative to the head, -1..1. Positive x = toward the subject's
    // own left; positive y = up.
    gazeX: avg(b("eyeLookOutLeft") - b("eyeLookInLeft"), b("eyeLookInRight") - b("eyeLookOutRight")),
    gazeY: avg(b("eyeLookUpLeft"), b("eyeLookUpRight")) - avg(b("eyeLookDownLeft"), b("eyeLookDownRight")),
    browRaise: Math.max(b("browInnerUp"), avg(b("browOuterUpLeft"), b("browOuterUpRight"))),
    browDown: avg(b("browDownLeft"), b("browDownRight")),
    jawOpen: b("jawOpen"),
    mouthPress: avg(b("mouthPressLeft"), b("mouthPressRight")),
  };
}
