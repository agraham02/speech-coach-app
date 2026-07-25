import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Slider from "@react-native-community/slider";
import { colors, spacing, typography } from "../../theme/theme";

interface LabeledSliderProps {
  label: string;
  value: number;
  minimumValue: number;
  maximumValue: number;
  step: number;
  formatValue: (value: number) => string;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function LabeledSlider({
  label,
  value,
  minimumValue,
  maximumValue,
  step,
  formatValue,
  onChange,
  disabled,
}: LabeledSliderProps) {
  const [displayValue, setDisplayValue] = useState(value);

  return (
    <View style={[styles.container, disabled && styles.disabled]}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{formatValue(displayValue)}</Text>
      </View>
      <Slider
        value={value}
        minimumValue={minimumValue}
        maximumValue={maximumValue}
        step={step}
        disabled={disabled}
        onValueChange={setDisplayValue}
        onSlidingComplete={onChange}
        minimumTrackTintColor={colors.accent}
        maximumTrackTintColor={colors.border}
        thumbTintColor={colors.accent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  disabled: { opacity: 0.4 },
  header: { flexDirection: "row", justifyContent: "space-between" },
  label: { color: colors.textSecondary, fontSize: typography.body, fontWeight: "600" },
  value: { color: colors.textPrimary, fontSize: typography.body, fontWeight: "700" },
});
