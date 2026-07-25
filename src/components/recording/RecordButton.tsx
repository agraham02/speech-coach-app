import { useEffect } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { colors } from "../../theme/theme";

interface RecordButtonProps {
  isRecording: boolean;
  onPress: () => void;
  disabled?: boolean;
}

export function RecordButton({ isRecording, onPress, disabled }: RecordButtonProps) {
  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0);

  useEffect(() => {
    if (isRecording) {
      ringScale.value = 1;
      ringOpacity.value = 0.5;
      ringScale.value = withRepeat(withTiming(1.35, { duration: 1100 }), -1, false);
      ringOpacity.value = withRepeat(withTiming(0, { duration: 1100 }), -1, false);
    } else {
      cancelAnimation(ringScale);
      cancelAnimation(ringOpacity);
      ringScale.value = 1;
      ringOpacity.value = 0;
    }
  }, [isRecording, ringScale, ringOpacity]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.wrapper, pressed && !disabled && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={isRecording ? "Stop recording" : "Start recording"}
    >
      {isRecording ? <Animated.View style={[styles.pulseRing, pulseStyle]} /> : null}
      <Animated.View style={[styles.outerRing, disabled && styles.disabled]}>
        <Animated.View style={[styles.inner, isRecording ? styles.innerRecording : styles.innerIdle]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: 88, height: 88, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  pulseRing: {
    position: "absolute",
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.danger,
  },
  outerRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 4,
    borderColor: "white",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
  inner: { backgroundColor: colors.danger },
  innerIdle: { width: 70, height: 70, borderRadius: 35 },
  innerRecording: { width: 30, height: 30, borderRadius: 8 },
});
