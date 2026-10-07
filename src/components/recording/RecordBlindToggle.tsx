import { StyleSheet, Switch, Text, View } from "react-native";
import { darkColors as colors, radii, spacing, typography } from "../../theme/theme";

interface RecordBlindToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

export function RecordBlindToggle({ value, onValueChange, disabled }: RecordBlindToggleProps) {
  return (
    <View style={styles.row}>
      <View style={styles.textGroup}>
        <Text style={styles.label}>Record blind</Text>
        <Text style={styles.sublabel}>Hide the preview while recording</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: colors.accent, false: "rgba(255,255,255,0.2)" }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  textGroup: { gap: 2 },
  label: { color: colors.textPrimary, fontSize: typography.body, fontWeight: "600" },
  sublabel: { color: colors.textSecondary, fontSize: typography.caption },
});
