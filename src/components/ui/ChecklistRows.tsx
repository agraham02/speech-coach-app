import { Fragment } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { PressableScale } from "../common/PressableScale";
import { Txt } from "../common/Txt";
import { tick } from "../../utils/haptics";
import { toggleKey } from "./inputLogic";

export interface ChecklistItem<T extends string = string> {
  key: T;
  label: string;
}

interface ChecklistRowsProps<T extends string> {
  items: readonly ChecklistItem<T>[];
  // The keys that are ticked.
  value: readonly T[];
  onChange: (value: T[]) => void;
}

// "Pick several": a row per item with a square check. Put it in an outlined
// ListGroup, or on its own (it draws its own hairlines between rows).
export function ChecklistRows<T extends string>({ items, value, onChange }: ChecklistRowsProps<T>) {
  const styles = useStyles();
  const { colors } = useTheme();
  const order = items.map((i) => i.key);
  return (
    <View>
      {items.map((item, i) => {
        const on = value.includes(item.key);
        return (
          <Fragment key={item.key}>
            {i > 0 ? <View style={styles.hairline} /> : null}
            <PressableScale
              onPress={() => {
                tick();
                onChange(toggleKey(value, item.key, order) as T[]);
              }}
              scaleTo={0.98}
              style={styles.row}
              accessibilityRole="checkbox"
              accessibilityLabel={item.label}
              accessibilityState={{ checked: on }}
            >
              <View style={[styles.box, on && styles.boxOn]}>{on ? <Ionicons name="checkmark" size={17} color={colors.onAccent} /> : null}</View>
              <Txt variant="body" style={styles.label}>
                {item.label}
              </Txt>
            </PressableScale>
          </Fragment>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 52, paddingVertical: 8 },
  box: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: t.colors.textMuted, alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: t.colors.textPrimary, borderColor: t.colors.textPrimary },
  label: { flex: 1, lineHeight: 22 },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: t.colors.separator },
}));
