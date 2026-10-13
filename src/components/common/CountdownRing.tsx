import type { ReactNode } from "react";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedProps, useSharedValue, withTiming } from "react-native-reanimated";
import { useTheme } from "../../theme/ThemeProvider";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface CountdownRingProps {
  size: number;
  strokeWidth?: number;
  // How long the ring takes to drain from full to empty.
  durationMs: number;
  // Changing this restarts the countdown from full (a new step, a new take).
  runKey?: string | number;
  color?: string;
  trackColor?: string;
  children?: ReactNode;
}

// A ring that drains in one continuous, linear sweep from full to exactly
// empty over `durationMs`. ProgressRing eases between values, which makes a
// whole-second countdown move in steps and never quite reach zero; this one
// is driven by time, not by the number in the middle. It keeps running with
// reduced motion on — a timer that jumps to empty would be wrong, not calm.
export function CountdownRing({ size, strokeWidth = 6, durationMs, runKey = 0, color, trackColor, children }: CountdownRingProps) {
  const { colors } = useTheme();
  const stroke = color ?? colors.accent;
  const track = trackColor ?? colors.surfaceRaised;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const left = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(left);
    left.value = 1;
    left.value = withTiming(0, { duration: Math.max(1, durationMs), easing: Easing.linear, reduceMotion: ReduceMotion.Never });
    return () => cancelAnimation(left);
  }, [runKey, durationMs, left]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - left.value),
    // A round cap would leave a dot where the ring has run out.
    strokeOpacity: left.value <= 0.002 ? 0 : 1,
  }));

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={track} strokeWidth={strokeWidth} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={stroke}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
        />
      </Svg>
      {children ? <View style={styles.center}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center" },
  // Rotated so the sweep starts at 12 o'clock and drains clockwise.
  svg: { position: "absolute", transform: [{ rotate: "-90deg" }] },
  center: { alignItems: "center", justifyContent: "center" },
});
