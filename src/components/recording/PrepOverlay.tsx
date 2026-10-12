import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { darkColors as colors, radii, spacing, typography } from "../../theme/theme";

interface PrepOverlayProps {
  promptText: string;
  // Questions to think through during prep (hidden once recording starts).
  notes?: string[];
  remainingSeconds: number;
  onSkip: () => void;
  onClose: () => void;
  topInset: number;
}

// Shown while brainstorming, before recording auto-starts. Sits above the
// live camera preview + framing guide, which keep running underneath.
export function PrepOverlay({ promptText, notes, remainingSeconds, onSkip, onClose, topInset }: PrepOverlayProps) {
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
        {notes?.length ? (
          <View style={styles.notes}>
            {notes.map((n) => (
              <Text key={n} style={styles.noteText}>
                · {n}
              </Text>
            ))}
          </View>
        ) : null}
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
  // A dark backdrop keeps the prompt readable over a bright room.
  top: {
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
    borderRadius: radii.lg,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  label: { color: colors.accent, fontSize: typography.caption, fontWeight: "700", letterSpacing: 1 },
  promptText: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "600", textAlign: "center" },
  notes: { marginTop: spacing.xs, gap: 4, alignSelf: "stretch" },
  noteText: { color: colors.textPrimary, fontSize: typography.body, lineHeight: 21 },
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
