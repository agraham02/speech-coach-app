import { View } from "react-native";
import { Txt } from "../common/Txt";
import { Mono } from "./Mono";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

interface MeterProps {
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  // Positions on the scale to mark (a threshold, or its mirror image).
  marks?: number[];
  // Fill from the middle (signed values like yaw) rather than the left.
  centered?: boolean;
  decimals?: number;
  unit?: string;
  // Color the fill when the value is past a mark.
  alert?: boolean;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const pc = (n: number): `${number}%` => `${n * 100}%`;

// A labelled bar with the threshold marked on it, for live face signals.
export function Meter({ label, value, min, max, marks = [], centered, decimals = 2, unit = "", alert }: MeterProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const at = (v: number) => clamp01((v - min) / (max - min));
  const here = value === undefined ? undefined : at(value);
  const zero = at(0);
  const from = here === undefined ? 0 : centered ? Math.min(here, zero) : 0;
  const to = here === undefined ? 0 : centered ? Math.max(here, zero) : here;
  return (
    <View style={styles.row}>
      <Txt variant="footnote" tone="secondary" style={styles.label}>
        {label}
      </Txt>
      <View style={styles.track}>
        <View
          style={[styles.fill, { left: pc(from), width: pc(to - from), backgroundColor: alert ? colors.warning : colors.textSecondary }]}
        />
        {centered ? <View style={[styles.mark, { left: pc(zero), backgroundColor: colors.textMuted, opacity: 0.5 }]} /> : null}
        {marks.map((m) => (
          <View key={m} style={[styles.mark, { left: pc(at(m)), backgroundColor: colors.textPrimary }]} />
        ))}
      </View>
      <Mono style={styles.value}>{value === undefined ? "-" : value.toFixed(decimals) + unit}</Mono>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: "row", alignItems: "center", gap: t.space.sm + 2, minHeight: 26 },
  label: { width: 78 },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: t.colors.surfaceRaised, overflow: "hidden" },
  fill: { position: "absolute", top: 0, bottom: 0, borderRadius: 4 },
  mark: { position: "absolute", top: 0, bottom: 0, width: 2 },
  value: { width: 62, textAlign: "right" },
}));
