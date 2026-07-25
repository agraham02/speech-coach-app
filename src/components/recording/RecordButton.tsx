import { Pressable, StyleSheet, View } from "react-native";
import { colors } from "../../theme/theme";

interface RecordButtonProps {
  isRecording: boolean;
  onPress: () => void;
  disabled?: boolean;
}

export function RecordButton({ isRecording, onPress, disabled }: RecordButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.outerRing, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <View style={[styles.inner, isRecording ? styles.innerRecording : styles.innerIdle]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outerRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 4,
    borderColor: "white",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
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
