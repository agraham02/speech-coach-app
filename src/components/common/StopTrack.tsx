import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Txt } from "./Txt";
import { makeStyles } from "../../theme/ThemeProvider";

interface Props {
  // One label per stop, low to high. The value is the 1-based stop.
  labels: readonly string[];
  value: number | null;
  onChange: (value: number) => void;
  accessibilityLabel: string;
}

// A short named track: a dot for each stop with its word underneath (Rough
// to Great). For a verdict in words rather than an amount; amounts use
// ScaleSlider and plain 1-5 numbers use ScaleChips.
export function StopTrack({ labels, value, onChange, accessibilityLabel }: Props) {
  const styles = useStyles();
  return (
    <View style={styles.row} accessibilityLabel={accessibilityLabel}>
      {labels.map((label, i) => {
        const stop = i + 1;
        const selected = value === stop;
        return (
          <Pressable
            key={label}
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              onChange(stop);
            }}
            style={styles.stop}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            hitSlop={4}
          >
            <View style={[styles.dot, selected && styles.dotOn]}>
              <Txt variant="footnote" weight="600" tone={selected ? "onAccent" : "secondary"}>
                {stop}
              </Txt>
            </View>
            <Txt variant="caption1" tone={selected ? "primary" : "muted"} weight={selected ? "600" : "400"} align="center">
              {label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: "row", gap: t.space.xs },
  stop: { flex: 1, alignItems: "center", gap: t.space.xs, minHeight: 44 },
  dot: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: t.colors.surfaceRaised },
  dotOn: { backgroundColor: t.colors.accent },
}));
