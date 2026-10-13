import { useEffect } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { darkColors as colors } from "../../theme/theme";
import { spring } from "../../theme/motion";
import { tap } from "../../utils/haptics";

interface RecordButtonProps {
  isRecording: boolean;
  onPress: () => void;
  disabled?: boolean;
}

const SIZE = 84;
const CORE_IDLE = 66;
const CORE_LIVE = 30;

// The record button: a white ring around a red core that morphs from a
// circle (ready) to a rounded square (stop) — with a slow pulse while live,
// the one looping animation that means "this is happening now".
export function RecordButton({ isRecording, onPress, disabled }: RecordButtonProps) {
  const live = useSharedValue(isRecording ? 1 : 0);
  const pressed = useSharedValue(0);
  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0);

  useEffect(() => {
    live.value = withSpring(isRecording ? 1 : 0, spring.gentle);
    if (isRecording) {
      ringScale.value = 1;
      ringOpacity.value = 0.45;
      ringScale.value = withRepeat(withTiming(1.4, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false);
      ringOpacity.value = withRepeat(withTiming(0, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false);
    } else {
      cancelAnimation(ringScale);
      cancelAnimation(ringOpacity);
      ringScale.value = 1;
      ringOpacity.value = 0;
    }
  }, [isRecording, live, ringScale, ringOpacity]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));
  const coreStyle = useAnimatedStyle(() => {
    const size = CORE_IDLE + (CORE_LIVE - CORE_IDLE) * live.value;
    return {
      width: size,
      height: size,
      borderRadius: size / 2 - (size / 2 - 8) * live.value,
      transform: [{ scale: 1 - 0.08 * pressed.value }],
    };
  });

  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      onPressIn={() => {
        pressed.value = withSpring(1, spring.press);
      }}
      onPressOut={() => {
        pressed.value = withSpring(0, spring.press);
      }}
      disabled={disabled}
      style={styles.wrapper}
      accessibilityRole="button"
      accessibilityLabel={isRecording ? "Stop recording" : "Start recording"}
    >
      <Animated.View style={[styles.pulseRing, pulseStyle]} />
      <Animated.View style={[styles.outerRing, disabled && styles.disabled]}>
        <Animated.View style={[styles.core, coreStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  pulseRing: {
    position: "absolute",
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.record,
  },
  outerRing: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  disabled: { opacity: 0.4 },
  core: { backgroundColor: colors.record },
});
