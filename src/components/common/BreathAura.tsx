import { useEffect, useId } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { BREATH_MIN_SCALE, breathTarget, type BreathPhase } from "../../domain/breath";
import { useTheme } from "../../theme/ThemeProvider";

interface BreathAuraProps {
  // Full size, at the end of a full breath in.
  size: number;
  color: string;
  phase?: BreathPhase;
  fill?: number;
  seconds: number;
  // Changes with every step, so each one starts its own move.
  runKey: string | number;
}

// A soft translucent glow behind the countdown ring that swells as you
// breathe in and settles as you breathe out, so the breath has a shape to
// follow. It holds still on a hold. With reduced motion it brightens and
// dims instead of growing.
export function BreathAura({ size, color, phase, fill, seconds, runKey }: BreathAuraProps) {
  const { scheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const amount = useSharedValue(BREATH_MIN_SCALE);
  const strength = scheme === "light" ? 0.38 : 0.55;

  useEffect(() => {
    const target = breathTarget(phase, fill);
    if (target === null) {
      cancelAnimation(amount);
      return;
    }
    amount.value = withTiming(target, { duration: seconds * 1000, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.Never });
    return () => cancelAnimation(amount);
    // Each step is its own move; the aura reads only the step's own values.
  }, [runKey, phase, fill, seconds, amount]);

  const style = useAnimatedStyle(() =>
    reduceMotion
      ? { opacity: 0.35 + 0.65 * ((amount.value - BREATH_MIN_SCALE) / (1 - BREATH_MIN_SCALE)), transform: [{ scale: 0.85 }] }
      : { opacity: 1, transform: [{ scale: amount.value }] },
  );

  return (
    <View style={[styles.wrap, { width: size, height: size }]} pointerEvents="none">
      <Animated.View style={[{ width: size, height: size }, style]}>
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor={color} stopOpacity={strength} />
              <Stop offset="0.7" stopColor={color} stopOpacity={strength * 0.7} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", alignItems: "center", justifyContent: "center" },
});
