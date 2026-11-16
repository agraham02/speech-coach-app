import { View } from "react-native";
import { makeStyles } from "../../theme/ThemeProvider";
import { PressableScale } from "../common/PressableScale";
import { Txt } from "../common/Txt";
import { tick } from "../../utils/haptics";
import { DAY_INITIALS, DAY_NAMES, DAYS_MONDAY_FIRST, normalizeDays, sameDays, shortcutDays, toggleDay } from "./inputLogic";

interface DayPickerProps {
  // Day numbers, 0 (Sunday) to 6. Never empty.
  value: readonly number[];
  onChange: (days: number[]) => void;
}

// Seven day circles, Monday first, with "Every day" and "Weekdays" under
// them. At least one day always stays on.
export function DayPicker({ value, onChange }: DayPickerProps) {
  const styles = useStyles();
  const days = normalizeDays(value);
  const every = sameDays(days, shortcutDays("every"));
  const weekdays = sameDays(days, shortcutDays("weekdays"));

  function setDays(next: number[]) {
    if (sameDays(next, days)) return;
    tick();
    onChange(next);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.grid}>
        {DAYS_MONDAY_FIRST.map((day) => {
          const on = days.includes(day);
          return (
            <PressableScale
              key={day}
              onPress={() => setDays(toggleDay(days, day))}
              scaleTo={0.94}
              hitSlop={{ top: 2, bottom: 2 }}
              style={[styles.day, on && styles.dayOn]}
              accessibilityRole="checkbox"
              accessibilityLabel={DAY_NAMES[day]}
              accessibilityState={{ checked: on }}
            >
              <Txt variant="subhead" weight="600" tone={on ? "onAccent" : "primary"}>
                {DAY_INITIALS[day]}
              </Txt>
            </PressableScale>
          );
        })}
      </View>
      <View style={styles.shortcuts}>
        <PressableScale onPress={() => setDays(shortcutDays("every"))} style={styles.shortcut} accessibilityRole="button" accessibilityLabel="Every day" accessibilityState={{ selected: every }}>
          <Txt variant="subhead" weight="600" tone={every ? "primary" : "secondary"}>
            Every day
          </Txt>
        </PressableScale>
        <PressableScale onPress={() => setDays(shortcutDays("weekdays"))} style={styles.shortcut} accessibilityRole="button" accessibilityLabel="Weekdays" accessibilityState={{ selected: weekdays }}>
          <Txt variant="subhead" weight="600" tone={weekdays ? "primary" : "secondary"}>
            Weekdays
          </Txt>
        </PressableScale>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.space.xs },
  grid: { flexDirection: "row", gap: 6 },
  day: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  dayOn: { backgroundColor: t.colors.textPrimary, borderColor: t.colors.textPrimary },
  shortcuts: { flexDirection: "row", gap: t.space.md },
  shortcut: { minHeight: 44, justifyContent: "center" },
}));
