import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Txt } from "./Txt";
import { makeStyles } from "../../theme/ThemeProvider";

interface Props {
  value: number | null;
  onChange: (value: number) => void;
  lowLabel?: string;
  highLabel?: string;
  max?: number;
}

// An honest 1-5 (or 1-max) self-rating: round chips with end labels.
export function RatingScale({ value, onChange, lowLabel = "Not at all", highLabel = "Completely", max = 5 }: Props) {
  const styles = useStyles();
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <Pressable
            key={n}
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              onChange(n);
            }}
            style={[styles.chip, value === n && styles.chipOn]}
            accessibilityRole="button"
            accessibilityLabel={`${n} out of ${max}`}
            accessibilityState={{ selected: value === n }}
          >
            <Txt variant="headline" tone={value === n ? "onAccent" : "primary"}>
              {n}
            </Txt>
          </Pressable>
        ))}
      </View>
      <View style={styles.labels}>
        <Txt variant="caption1" tone="muted">
          {lowLabel}
        </Txt>
        <Txt variant="caption1" tone="muted">
          {highLabel}
        </Txt>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.space.xs },
  row: { flexDirection: "row", justifyContent: "space-between" },
  chip: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: t.colors.surfaceRaised },
  chipOn: { backgroundColor: t.colors.accent },
  labels: { flexDirection: "row", justifyContent: "space-between" },
}));
