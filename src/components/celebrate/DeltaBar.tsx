import { useEffect } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { duration, easeOut } from "../../theme/motion";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

interface DeltaBarProps {
  // 0-1 fill now, and where it was before (defaults to `value`: no change).
  value: number;
  from?: number;
  color: string;
  trackColor?: string;
  // Wait before filling — for beats that play one after another.
  delay?: number;
  height?: number;
  // Fill from empty on mount instead of starting at `from`.
  growIn?: boolean;
}

// A progress bar that shows a change: the old fill stays as a faint ghost
// and the new fill grows from it. A drop shrinks back past the ghost, so a
// dip is visible without shouting. Used for stage progress and the moves a
// take made.
export function DeltaBar({ value, from, color, trackColor, delay = 0, height = 8, growIn }: DeltaBarProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const target = clamp(value);
  const start = clamp(from ?? value);
  const fill = useSharedValue(reduced ? target : growIn ? 0 : start);

  useEffect(() => {
    if (reduced) {
      fill.value = target;
      return;
    }
    fill.value = withDelay(delay, withTiming(target, { duration: duration.slow * 2, easing: easeOut }));
  }, [target, delay, reduced, fill]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  const ghost = from != null && Math.abs(start - target) > 0.001;

  return (
    <View style={[styles.track, { height, borderRadius: height / 2, backgroundColor: trackColor ?? colors.surfaceRaised }]}>
      {ghost ? <View style={[styles.ghost, { width: `${start * 100}%`, backgroundColor: color, borderRadius: height / 2 }]} /> : null}
      <Animated.View style={[styles.fill, fillStyle, { backgroundColor: color, borderRadius: height / 2 }]} />
    </View>
  );
}

function clamp(x: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
}

const useStyles = makeStyles(() => ({
  track: { width: "100%", overflow: "hidden" },
  ghost: { position: "absolute", left: 0, top: 0, bottom: 0, opacity: 0.3 },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0 },
}));
