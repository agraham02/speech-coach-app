import { View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import { Mono } from "./Mono";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

export interface GazePoint {
  // gazeX, -1..1. Positive = toward MediaPipe's left, which (its image being
  // mirrored) is where the eyes move toward the screen right of the preview.
  x: number;
  y: number; // gazeY, -1..1, positive = up
}

interface GazeTargetProps {
  point: GazePoint | null;
  trail: GazePoint[];
  // The eyes-off-lens radius and the looking-down line, in gaze units.
  limit: number;
  downLimit: number;
  size?: number;
}

// Where the eyes point, against the circle that counts as on the lens: the
// view for tuning the gaze thresholds. Below the dashed line is looking down.
export function GazeTarget({ point, trail, limit, downLimit, size = 168 }: GazeTargetProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const c = size / 2;
  const r = c - 8;
  const px = (g: GazePoint) => c + g.x * r;
  const py = (g: GazePoint) => c - g.y * r;
  const downY = c - downLimit * r;
  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size}>
        <Circle cx={c} cy={c} r={r} fill="none" stroke={colors.textMuted} strokeWidth={1} opacity={0.4} />
        <Line x1={c} y1={8} x2={c} y2={size - 8} stroke={colors.textMuted} strokeWidth={1} opacity={0.25} />
        <Line x1={8} y1={c} x2={size - 8} y2={c} stroke={colors.textMuted} strokeWidth={1} opacity={0.25} />
        <Circle cx={c} cy={c} r={limit * r} fill={colors.successMuted} stroke={colors.success} strokeWidth={1.5} />
        <Line x1={8} y1={downY} x2={size - 8} y2={downY} stroke={colors.warning} strokeWidth={1.5} strokeDasharray="4 4" />
        {trail.length > 1 ? <Polyline points={trail.map((p) => px(p) + "," + py(p)).join(" ")} fill="none" stroke={colors.textSecondary} strokeWidth={1.5} opacity={0.6} /> : null}
        {point ? <Circle cx={px(point)} cy={py(point)} r={6} fill={colors.textPrimary} /> : null}
      </Svg>
      <Mono variant="caption2" tone="muted">
        green = counts as on the lens, dashed = looking down
      </Mono>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { alignItems: "center", gap: t.space.xs },
}));
