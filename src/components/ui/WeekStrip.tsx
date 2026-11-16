import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { Txt } from "../common/Txt";
import { weekCircle, weekDayLabel, weekOrder, type WeekDayState } from "./displayLogic";

export type { WeekDayState } from "./displayLogic";

export interface WeekStripProps {
  // The seven days' states, in display order (starting on `weekStartsOn`).
  days: readonly WeekDayState[];
  // Index (0 to 6) of today within `days`; its letter is in full ink, semibold.
  todayIndex?: number;
  // 0 Sunday, 1 Monday (default).
  weekStartsOn?: 0 | 1;
  testID?: string;
}

const CIRCLE = 32;

// Seven days: a letter over a 32dp circle. The states differ by shape, never
// colour alone: full is a filled disc, part a thick (3dp) ring, frozen a ring
// on a tint with a snowflake, and missed or future a dashed ring.
export function WeekStrip({ days, todayIndex, weekStartsOn = 1, testID }: WeekStripProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const order = weekOrder(weekStartsOn);
  return (
    <View style={styles.row} testID={testID}>
      {order.map((day, i) => {
        const state = days[i] ?? "future";
        const today = i === todayIndex;
        const circle = weekCircle(state);
        const frozen = state === "frozen";
        return (
          <View key={day.dow} style={styles.day} accessible accessibilityLabel={weekDayLabel(day.name, state, today)}>
            <Txt variant="caption1" weight={today ? "600" : "500"} tone={today ? "primary" : "muted"}>
              {day.letter}
            </Txt>
            <View
              style={[
                styles.circle,
                circle.filled && { backgroundColor: colors.textPrimary },
                frozen && { backgroundColor: colors.pillar.connection.bg },
                circle.ringWidth > 0 && {
                  borderWidth: circle.ringWidth,
                  borderStyle: circle.dashed ? "dashed" : "solid",
                  borderColor: frozen ? colors.pillar.connection.fg : circle.dashed ? colors.textMuted : colors.textPrimary,
                },
              ]}
            >
              {circle.glyph ? <Ionicons name="snow" size={14} color={colors.pillar.connection.fg} /> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  row: { flexDirection: "row" },
  // Each day is a column at least 44dp wide.
  day: { flex: 1, minWidth: 44, alignItems: "center", rowGap: 6 },
  circle: { width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, alignItems: "center", justifyContent: "center" },
}));
