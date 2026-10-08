import { StyleSheet, Text, View } from "react-native";
import { radii, spacing, typography } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeProvider";

interface BadgeProps {
  label: string;
  // Defaults to the standard accent-blue treatment — pass colorForCategory(...)
  // (see domain/categoryColor.ts) to color-code by category instead.
  fg?: string;
  bg?: string;
}

export function Badge({ label, fg, bg }: BadgeProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: bg ?? colors.accentMuted }]}>
      <Text style={[styles.text, { color: fg ?? colors.accent }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
  text: {
    fontSize: typography.caption - 1,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
});
