import { StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, typography } from "../../theme/theme";

interface BadgeProps {
  label: string;
  // Defaults to the standard accent-blue treatment — pass colorForCategory(...)
  // (see domain/categoryColor.ts) to color-code by category instead.
  fg?: string;
  bg?: string;
}

export function Badge({ label, fg = colors.accent, bg = colors.accentMuted }: BadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }]}>{label.toUpperCase()}</Text>
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
