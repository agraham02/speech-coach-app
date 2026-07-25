import { StyleSheet, Text, View } from "react-native";
import { RecordingTimer } from "./RecordingTimer";
import { colors, spacing, typography } from "../../theme/theme";

interface RecordBlindOverlayProps {
  promptText: string;
  elapsedSeconds: number;
}

// Opaque cover shown over the live preview when "record blind" is on. The
// camera session and face-detection frame processor keep running underneath —
// this is purely a visual layer, so the haptic face-lost warning still fires.
export function RecordBlindOverlay({ promptText, elapsedSeconds }: RecordBlindOverlayProps) {
  return (
    <View style={styles.container}>
      <View style={styles.recDot} />
      <Text style={styles.prompt}>{promptText}</Text>
      <RecordingTimer elapsedSeconds={elapsedSeconds} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.lg,
  },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  prompt: { color: colors.textPrimary, fontSize: typography.title, textAlign: "center", lineHeight: 30 },
});
