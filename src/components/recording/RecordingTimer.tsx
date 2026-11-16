import { StyleSheet, View } from "react-native";
import { Txt } from "../common/Txt";
import { darkColors as colors, radii, spacing } from "../../theme/theme";
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
        <Txt variant="headline" tabular style={styles.smallText}>{formatDuration(elapsedSeconds)}</Txt>
      </View>
    );
  }

  return <Txt variant="display" tabular style={styles.largeText}>{formatDuration(elapsedSeconds)}</Txt>;
}

const styles = StyleSheet.create({
  // The big timer is sized to the screen, so the size is set here on top of the display variant.
  largeText: { color: colors.textPrimary, fontSize: 48 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "rgba(10,10,8,0.6)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.record },
  smallText: {
    color: colors.textPrimary,
  },
});
