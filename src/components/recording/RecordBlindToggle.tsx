import { StyleSheet, Switch, View } from "react-native";
import { Txt } from "../common/Txt";
import { darkColors as colors, radii, spacing } from "../../theme/theme";

interface RecordBlindToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

export function RecordBlindToggle({ value, onValueChange, disabled }: RecordBlindToggleProps) {
  return (
    <View style={styles.row}>
      <View style={styles.textGroup}>
        <Txt variant="callout" weight="600" style={styles.label}>Record blind</Txt>
        <Txt variant="footnote" style={styles.sublabel}>Blank screen while recording. Switch any time with the eye button.</Txt>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: colors.success, false: "rgba(255,255,255,0.2)" }}
        thumbColor="#FFFFFF"
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
  label: { color: colors.textPrimary },
  sublabel: { color: colors.textSecondary },
});
