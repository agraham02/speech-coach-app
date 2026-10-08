import { StyleSheet, Text, View } from "react-native";
import { radii, spacing, typography, type Colors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeProvider";

type BannerTone = "success" | "warning" | "danger" | "neutral";

const toneStyles = (colors: Colors): Record<BannerTone, { bg: string; fg: string }> => ({
  success: { bg: colors.successMuted, fg: colors.success },
  warning: { bg: "rgba(245,165,36,0.15)", fg: colors.warning },
  danger: { bg: colors.dangerMuted, fg: colors.danger },
  neutral: { bg: colors.surfaceRaised, fg: colors.textSecondary },
});

export function Banner({ text, tone = "neutral" }: { text: string; tone?: BannerTone }) {
  const { colors } = useTheme();
  const toneStyle = toneStyles(colors)[tone];
  return (
    <View style={[styles.container, { backgroundColor: toneStyle.bg }]}>
      <View style={[styles.dot, { backgroundColor: toneStyle.fg }]} />
      <Text style={[styles.text, { color: toneStyle.fg }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontSize: typography.body, fontWeight: "600", flexShrink: 1 },
});
