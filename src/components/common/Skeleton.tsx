import { useEffect } from "react";
import { type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { makeStyles } from "../../theme/ThemeProvider";
import { easeOut } from "../../theme/motion";

// A placeholder block that softly pulses while content loads — shaped like
// what's coming, so the screen doesn't jump when it arrives.
export function Skeleton({ width = "100%", height = 16, radius, style }: { width?: DimensionValue; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 900, easing: easeOut }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse]);
  const animated = useAnimatedStyle(() => ({ opacity: 0.55 + 0.45 * pulse.value }));
  return <Animated.View style={[styles.block, { width, height, borderRadius: radius ?? Math.min(12, height / 2) }, animated, style]} />;
}

const useStyles = makeStyles((t) => ({
  block: { backgroundColor: t.colors.surfaceRaised },
}));
