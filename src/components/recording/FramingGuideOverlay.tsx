import { StyleSheet, Text, View } from "react-native";
import type { FramingStatus } from "../../hooks/useFaceDetection";
import { darkColors as colors, radii, spacing, typography } from "../../theme/theme";

const STATUS_COPY: Record<FramingStatus, string> = {
  none: "Move into frame",
  off_center: "Center your face in the oval",
  good: "You're centered and visible",
};

const STATUS_COLOR: Record<FramingStatus, string> = {
  none: colors.danger,
  off_center: colors.warning,
  good: colors.success,
};

// Shown only before recording starts — confirms the speaker is centered and
// visible via the on-device face detector, before they commit to recording.
export function FramingGuideOverlay({ status }: { status: FramingStatus }) {
  const ringColor = STATUS_COLOR[status];

  return (
    <View style={styles.container} pointerEvents="none">
      <View style={[styles.frame, { borderColor: ringColor }]} />
      <View style={[styles.pill, { borderColor: ringColor }]}>
        <View style={[styles.dot, { backgroundColor: ringColor }]} />
        <Text style={styles.label}>{STATUS_COPY[status]}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: "absolute", bottom: 150, left: 0, right: 0, alignItems: "center", gap: spacing.md },
  frame: {
    width: 240,
    height: 310,
    borderRadius: 155,
    borderWidth: 3,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "rgba(11,11,15,0.75)",
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { color: colors.textPrimary, fontSize: typography.caption, fontWeight: "600" },
});
