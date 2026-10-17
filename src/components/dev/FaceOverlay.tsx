import Svg, { Circle, Rect, Text as SvgText } from "react-native-svg";
import { LANDMARK_INDICES, type FaceLandmarkerFace } from "vision-camera-face-landmarker";
import { mapPoint, type Size } from "../../domain/dev/faceLab";
import { useTheme } from "../../theme/ThemeProvider";

interface FaceOverlayProps {
  face: FaceLandmarkerFace | null;
  view: Size;
  mirror: boolean;
  framed: boolean;
}

// Short names for the plugin landmarks, in LANDMARK_INDICES order. Left and
// right are the user's physical sides: MediaPipe sees a mirrored image, so
// what it calls the right eye (33) is the physical left one, and so on.
const LABELS: Record<keyof typeof LANDMARK_INDICES, string> = {
  noseTip: "nose",
  forehead: "forehead",
  chin: "chin",
  faceEdgeRight: "edge L",
  faceEdgeLeft: "edge R",
  eyeOuterRight: "eye L",
  eyeOuterLeft: "eye R",
  betweenEyes: "brow",
  upperLipInner: "lip up",
  lowerLipInner: "lip dn",
};
const NAMES = Object.keys(LANDMARK_INDICES) as (keyof typeof LANDMARK_INDICES)[];

// The face box from MediaPipe and the landmarks the app uses, each labelled,
// drawn over the camera preview. A label that is not on the feature it names
// means the mapping or the orientation is wrong.
export function FaceOverlay({ face, view, mirror, framed }: FaceOverlayProps) {
  const { colors } = useTheme();
  if (!face || view.width === 0 || view.height === 0) return null;
  const image = { width: face.width, height: face.height };
  const map = (nx: number, ny: number) => mapPoint(nx, ny, image, view, mirror);
  const [minX, minY, maxX, maxY] = face.bounds;
  const a = map(minX, minY);
  const b = map(maxX, maxY);
  const color = framed ? colors.success : colors.warning;

  const points = NAMES.map((name, i) => ({ name, ...map(face.landmarks[i * 3], face.landmarks[i * 3 + 1]) })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

  return (
    <Svg width={view.width} height={view.height} style={{ position: "absolute", left: 0, top: 0 }} pointerEvents="none">
      <Rect x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)} rx={10} fill="none" stroke={color} strokeWidth={2} />
      {points.map((p) => (
        <Circle key={p.name} cx={p.x} cy={p.y} r={3.5} fill={color} />
      ))}
      {points.map((p) => (
        <SvgText key={p.name + "-label"} x={p.x + 6} y={p.y - 5} fontSize={10} fill="#FFFFFF" stroke="#000000" strokeWidth={0.4}>
          {LABELS[p.name]}
        </SvgText>
      ))}
    </Svg>
  );
}
