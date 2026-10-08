import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import Slider from "@react-native-community/slider";
import { spacing, typography } from "../../theme/theme";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

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
  const styles = useStyles();
  const { colors } = useTheme();
  const [displayValue, setDisplayValue] = useState(value);

  // @react-native-community/slider's `value` prop is write-only — its own
  // types document it as "entered once at the beginning still acts as an
  // initial value," so changing it after mount doesn't move the thumb.
  // Every caller used to only ever change `value` via this component's own
  // onChange (so the gap never showed) until "Reset to auto" (curriculum-
  // driven recording length, RecordingScreen.tsx) started changing it from
  // outside a user drag — confirmed live: the label text and thumb both
  // silently failed to update on reset before this fix. The library also
  // documents an imperative `updateValue()` escape hatch, but it's
  // `undefined` at runtime on the installed version (confirmed live via a
  // "undefined is not a function" crash) — `key={value}` below is the
  // simpler, version-independent fix: force a fresh mount, which re-reads
  // `value` as its (now up to date) initial value.
  useEffect(() => setDisplayValue(value), [value]);

  return (
    <View style={[styles.container, disabled && styles.disabled]}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{formatValue(displayValue)}</Text>
      </View>
      <Slider
        key={value}
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

const useStyles = makeStyles(({ colors }) => ({
  container: { gap: spacing.xs },
  disabled: { opacity: 0.4 },
  header: { flexDirection: "row", justifyContent: "space-between" },
  label: { color: colors.textSecondary, fontSize: typography.body, fontWeight: "600" },
  value: { color: colors.textPrimary, fontSize: typography.body, fontWeight: "700" },
}));
