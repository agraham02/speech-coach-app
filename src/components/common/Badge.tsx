import { StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, typography } from "../../theme/theme";

export function Badge({ label }: { label: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    backgroundColor: colors.accentMuted,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
  text: {
    color: colors.accent,
    fontSize: typography.caption - 1,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
});
