import { View } from "react-native";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

interface SparklineProps {
  // Oldest first; null is a gap.
  values: (number | null)[];
  // The value at the top of the chart. Defaults to the largest value.
  max?: number;
  // Slots to draw, so a short history fills from the right.
  slots: number;
  height?: number;
  color?: string;
}

// A row of thin bars for a live reading (memory, CPU). Plain Views: it
// redraws once a second at most, so Skia would be overkill.
export function Sparkline({ values, max, slots, height = 36, color }: SparklineProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const top = max ?? Math.max(1, ...values.map((v) => v ?? 0));
  const padded: (number | null)[] = [...Array(Math.max(0, slots - values.length)).fill(null), ...values.slice(-slots)];
  return (
    <View style={[styles.row, { height }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {padded.map((value, i) => (
        <View key={i} style={styles.slot}>
          {value != null ? (
            <View style={[styles.bar, { height: Math.max(1, Math.min(1, value / top) * height), backgroundColor: color ?? colors.textSecondary }]} />
          ) : null}
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: "row", alignItems: "flex-end", gap: 1, borderRadius: 4, overflow: "hidden", backgroundColor: t.colors.surfaceRaised },
  slot: { flex: 1, height: "100%", justifyContent: "flex-end" },
  bar: { borderTopLeftRadius: 1, borderTopRightRadius: 1 },
}));
