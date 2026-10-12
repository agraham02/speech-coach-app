import { StyleSheet, Text, View } from "react-native";
import { darkColors as colors, radii, spacing, font } from "../../theme/theme";
import { formatDuration } from "../../utils/dateUtils";

interface RecordingTimerProps {
  elapsedSeconds: number;
  size?: "large" | "small";
}

export function RecordingTimer({ elapsedSeconds, size = "large" }: RecordingTimerProps) {
  if (size === "small") {
    return (
      <View style={styles.badge}>
        <View style={styles.recDot} />
        <Text style={styles.smallText}>{formatDuration(elapsedSeconds)}</Text>
      </View>
    );
  }

  return <Text style={styles.largeText}>{formatDuration(elapsedSeconds)}</Text>;
}

const styles = StyleSheet.create({
  largeText: { color: colors.textPrimary, fontSize: 44, fontVariant: ["tabular-nums"], ...font("300") },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  smallText: {
    color: colors.textPrimary,
    fontSize: 17,
    fontVariant: ["tabular-nums"],
    ...font("600"),
  },
});
