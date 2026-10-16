import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { makeStyles } from "../../theme/ThemeProvider";
import { Txt } from "../common/Txt";

// A row of numbered chips for quick 1-5 verdicts on a take (how it came
// across, how present you were). Amounts — 0-10 attention or awkwardness —
// use ScaleSlider instead. Neutral colors on purpose: a rating is an
// observation, not a grade.
export function ScaleChips({
  value,
  onChange,
  min = 0,
  max = 10,
  lowLabel,
  highLabel,
  accessibilityLabel,
}: {
  value: number | null;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  lowLabel?: string;
  highLabel?: string;
  accessibilityLabel: string;
}) {
  const styles = useStyles();
  const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <View style={styles.wrap}>
      <View style={styles.row} accessibilityLabel={accessibilityLabel}>
        {values.map((n) => {
          const selected = value === n;
          return (
            <Pressable
              key={n}
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                onChange(n);
              }}
              style={[styles.chip, values.length > 6 && styles.chipSmall, selected && styles.chipOn]}
              accessibilityRole="button"
              accessibilityLabel={`${n}`}
              accessibilityState={{ selected }}
              hitSlop={4}
            >
              <Txt variant={values.length > 6 ? "footnote" : "headline"} weight="600" tone={selected ? "onAccent" : "primary"}>
                {n}
              </Txt>
            </Pressable>
          );
        })}
      </View>
      {lowLabel || highLabel ? (
        <View style={styles.labels}>
          <Txt variant="caption1" tone="muted">
            {lowLabel}
          </Txt>
          <Txt variant="caption1" tone="muted">
            {highLabel}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.space.xs },
  // 0-10 wraps onto two rows rather than shrinking below a 44 pt target.
  row: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm },
  chip: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: t.colors.surfaceRaised },
  chipSmall: { width: 44, height: 44, borderRadius: 22 },
  chipOn: { backgroundColor: t.colors.accent },
  labels: { flexDirection: "row", justifyContent: "space-between" },
}));
