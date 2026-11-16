import { ScrollView, View } from "react-native";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import type { PillarKey } from "../../theme/tokens";
import { PressableScale } from "../common/PressableScale";
import { Txt } from "../common/Txt";
import { nextFilterSelection } from "./inputLogic";

export interface FilterOption<T extends string = string> {
  key: T;
  label: string;
  // A small dot in this pillar's colour before the label. The label still
  // names it, so the colour is never the only signal.
  pillar?: PillarKey;
}

interface FilterChipsProps<T extends string> {
  options: readonly FilterOption<T>[];
  // The keys that are on (one at most unless `multiple`).
  value: readonly T[];
  onChange: (value: T[]) => void;
  multiple?: boolean;
  // Single mode: tapping the chosen chip again clears it.
  allowClear?: boolean;
  accessibilityLabel?: string;
}

// A scrolling row of filter chips: the one place chips stay. On is a dark
// fill with light text.
export function FilterChips<T extends string>({ options, value, onChange, multiple, allowClear, accessibilityLabel }: FilterChipsProps<T>) {
  const styles = useStyles();
  const { colors } = useTheme();
  const order = options.map((o) => o.key);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroller}
      contentContainerStyle={styles.content}
      accessibilityRole={multiple ? undefined : "radiogroup"}
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option) => {
        const on = value.includes(option.key);
        return (
          <PressableScale
            key={option.key}
            onPress={() => onChange(nextFilterSelection(value, option.key, order, !!multiple, allowClear) as T[])}
            haptic="tick"
            scaleTo={0.95}
            hitSlop={{ top: 4, bottom: 4 }}
            style={[styles.chip, on && styles.chipOn]}
            accessibilityRole={multiple ? "checkbox" : "radio"}
            accessibilityState={multiple ? { checked: on } : { checked: on, selected: on }}
          >
            {option.pillar ? <View style={[styles.dot, { backgroundColor: colors.pillar[option.pillar].fg }]} /> : null}
            <Txt variant="subhead" weight="500" tone={on ? "onAccent" : "primary"}>
              {option.label}
            </Txt>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

const useStyles = makeStyles((t) => ({
  // Runs to the screen edges so chips scroll under the gutter.
  scroller: { flexGrow: 0, flexShrink: 0, marginHorizontal: -t.layout.gutter },
  content: { paddingHorizontal: t.layout.gutter, gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  chipOn: { backgroundColor: t.colors.textPrimary, borderColor: t.colors.textPrimary },
  dot: { width: 8, height: 8, borderRadius: 4 },
}));
