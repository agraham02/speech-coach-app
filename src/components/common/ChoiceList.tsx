import { useEffect } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { duration, spring } from "../../theme/motion";
import { PressableScale } from "./PressableScale";
import { Txt } from "./Txt";

export interface Choice<T extends string> {
  key: T;
  label: string;
  detail?: string;
}

// Answers as large rows with a check that springs in — single choice
// (radio) or several (`multiple`).
export function ChoiceList<T extends string>({
  options,
  value,
  onChange,
  multiple,
}: {
  options: Choice<T>[];
  value: T | T[] | null | undefined;
  onChange: (key: T) => void;
  multiple?: boolean;
}) {
  const styles = useStyles();
  const selected = (k: T) => (Array.isArray(value) ? value.includes(k) : value === k);
  return (
    <View style={styles.list}>
      {options.map((o) => (
        <ChoiceRow key={o.key} label={o.label} detail={o.detail} on={selected(o.key)} multiple={multiple} onPress={() => onChange(o.key)} />
      ))}
    </View>
  );
}

function ChoiceRow({ label, detail, on, multiple, onPress }: { label: string; detail?: string; on: boolean; multiple?: boolean; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const v = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    v.value = on ? withSpring(1, spring.press) : withTiming(0, { duration: duration.fast });
  }, [on, v]);
  const mark = useAnimatedStyle(() => ({ transform: [{ scale: v.value }], opacity: v.value }));
  return (
    <PressableScale
      onPress={onPress}
      haptic="tick"
      scaleTo={0.98}
      accessibilityRole={multiple ? "checkbox" : "radio"}
      accessibilityState={multiple ? { checked: on } : { selected: on }}
      style={[styles.row, on && styles.rowOn]}
    >
      <View style={styles.text}>
        <Txt variant="body" weight={on ? "600" : "500"}>
          {label}
        </Txt>
        {detail ? (
          <Txt variant="footnote" tone="secondary">
            {detail}
          </Txt>
        ) : null}
      </View>
      <View style={[styles.box, multiple ? styles.square : styles.round, on && styles.boxOn]}>
        <Animated.View style={mark}>
          <Ionicons name="checkmark" size={15} color={colors.onAccent} />
        </Animated.View>
      </View>
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  list: { gap: t.space.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space.md,
    minHeight: 58,
    paddingVertical: t.space.sm + 4,
    paddingHorizontal: t.space.md + 2,
    borderRadius: t.radius.md + 2,
    backgroundColor: t.colors.surface,
    borderWidth: 1.5,
    borderColor: "transparent",
    ...t.shadow.card,
  },
  rowOn: { borderColor: t.colors.accent },
  text: { flex: 1, gap: 2 },
  box: { width: 24, height: 24, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: t.colors.textMuted },
  round: { borderRadius: 12 },
  square: { borderRadius: 7 },
  boxOn: { backgroundColor: t.colors.accent, borderColor: t.colors.accent },
}));
