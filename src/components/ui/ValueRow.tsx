import { useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { AnchoredMenu } from "../common/AnchoredMenu";
import { PressableScale } from "../common/PressableScale";
import { Txt } from "../common/Txt";
import { stacksValue } from "./inputLogic";

export interface ValueOption<T extends string = string> {
  key: T;
  label: string;
}

interface ValueRowProps<T extends string> {
  label: string;
  value: T;
  options: readonly ValueOption<T>[];
  onChange: (value: T) => void;
  subtitle?: string;
  disabled?: boolean;
  testID?: string;
}

// "Pick one value": the label on the left, the current value and a chevron on
// the right. Tapping opens a small menu under the row with a check on the
// current choice. Sits in a ListGroup.
export function ValueRow<T extends string>({ label, value, options, onChange, subtitle, disabled, testID }: ValueRowProps<T>) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const stacked = stacksValue(fontScale);
  const current = options.find((o) => o.key === value);
  const currentLabel = current?.label ?? "";
  const selectedIndex = Math.max(0, options.findIndex((o) => o.key === value));

  return (
    <AnchoredMenu
      options={options.map((o, i) => ({ key: i, label: o.label }))}
      selected={selectedIndex}
      onPick={(i) => {
        const next = options[i];
        if (next && next.key !== value) onChange(next.key);
      }}
      renderTrigger={({ onPress }) => (
        <PressableScale
          onPress={onPress}
          disabled={disabled}
          scaleTo={0.98}
          style={[styles.row, disabled && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel={currentLabel ? `${label}, ${currentLabel}` : label}
          accessibilityHint="Opens a menu"
          accessibilityState={{ disabled }}
          testID={testID}
        >
          <View style={[styles.line, stacked && styles.lineStacked]}>
            <View style={[styles.text, !stacked && styles.textGrow]}>
              <Txt variant="body" style={styles.label}>
                {label}
              </Txt>
              {subtitle ? (
                <Txt variant="footnote" tone="secondary">
                  {subtitle}
                </Txt>
              ) : null}
            </View>
            <Txt variant="body" tone="secondary" style={[styles.label, stacked ? null : styles.value]} numberOfLines={stacked ? 2 : 1}>
              {currentLabel}
            </Txt>
          </View>
          <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
        </PressableScale>
      )}
    />
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: "row", alignItems: "center", gap: t.space.sm, minHeight: 52, paddingVertical: 8 },
  disabled: { opacity: 0.4 },
  line: { flex: 1, flexDirection: "row", alignItems: "center", gap: t.space.sm },
  lineStacked: { flexDirection: "column", alignItems: "flex-start", gap: 2 },
  text: { flexShrink: 1, gap: 1 },
  textGrow: { flex: 1 },
  label: { lineHeight: 22 },
  value: { flexShrink: 0, maxWidth: "55%" },
}));
