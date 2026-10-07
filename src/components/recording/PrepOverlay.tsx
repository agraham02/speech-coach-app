import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { darkColors as colors, radii, spacing, typography } from "../../theme/theme";

interface PrepOverlayProps {
  promptText: string;
  remainingSeconds: number;
  onSkip: () => void;
  onClose: () => void;
  topInset: number;
}

// Shown while brainstorming, before recording auto-starts. Sits above the
// live camera preview + framing guide, which keep running underneath.
export function PrepOverlay({ promptText, remainingSeconds, onSkip, onClose, topInset }: PrepOverlayProps) {
  return (
    <View style={styles.container} pointerEvents="box-none">
      <Pressable
        onPress={onClose}
        style={[styles.closeButton, { top: topInset }]}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Ionicons name="close" size={22} color={colors.textPrimary} />
      </Pressable>

      <View style={styles.top}>
        <Text style={styles.label}>Get ready</Text>
        <Text style={styles.promptText}>{promptText}</Text>
      </View>

      <View style={styles.countdownWrap} pointerEvents="none">
        <Text style={styles.countdown}>{remainingSeconds}</Text>
      </View>

      <Pressable onPress={onSkip} style={styles.skipButton}>
        <Text style={styles.skipText}>Start now</Text>
      </Pressable>
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
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xxl,
  },
  closeButton: {
    position: "absolute",
    left: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  top: { gap: spacing.sm, paddingHorizontal: spacing.xl, alignItems: "center", marginTop: spacing.xl },
  label: { color: colors.accent, fontSize: typography.caption, fontWeight: "700", letterSpacing: 1 },
  promptText: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "600", textAlign: "center" },
  countdownWrap: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 4,
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  countdown: { color: colors.textPrimary, fontSize: 56, fontWeight: "300", fontVariant: ["tabular-nums"] },
  skipButton: {
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.pill,
  },
  skipText: { color: colors.textPrimary, fontSize: typography.body, fontWeight: "600" },
});
