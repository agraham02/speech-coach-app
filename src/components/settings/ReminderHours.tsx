import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import { AnchoredMenu } from "../common/AnchoredMenu";
import { PressableScale } from "../common/PressableScale";
import { Txt } from "../common/Txt";
import { clockHour, hourAllowed, hoursInPeriod, periodHasValidHour, periodOf, sessionBounds, switchPeriod } from "../../domain/reminderSettings";
import { duration, easeOut } from "../../theme/motion";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

interface ReminderHoursProps {
  // One reminder hour (24-hour, local) per session of the daily goal, in
  // increasing order.
  hours: number[];
  // Sets session `index` to `hour`; the caller re-orders the later sessions
  // with setSessionHour.
  onChange: (index: number, hour: number) => void;
}

// A row per session with two dropdowns — the hour (1-12) and AM/PM. Each
// opens a small menu floating under its pill. Each session is later than the
// one before it, so earlier hours are greyed out. Whole hours only: a
// practice nudge doesn't need minutes.
export function ReminderHours({ hours, onChange }: ReminderHoursProps) {
  const styles = useStyles();
  return (
    <View>
      {hours.map((hour, index) => {
        const label = hours.length > 1 ? `Session ${index + 1}` : "Time";
        const period = periodOf(hour);
        const bounds = sessionBounds(hours, index);
        const orderHint = index > 0 ? `Must be after session ${index}` : "Leaves no room for the later sessions";
        return (
          <View key={index} style={[styles.row, index > 0 && styles.divided]}>
            <Txt variant="body" style={styles.flex}>
              {label}
            </Txt>
            <AnchoredMenu
              options={hoursInPeriod(period).map((h) => ({
                key: h,
                label: String(clockHour(h)),
                suffix: period,
                disabled: !hourAllowed(h, bounds),
                disabledHint: orderHint,
              }))}
              selected={hour}
              onPick={(h) => {
                if (h !== hour) onChange(index, h);
              }}
              renderTrigger={({ open, onPress }) => (
                <Dropdown value={String(clockHour(hour))} open={open} onPress={onPress} accessibilityLabel={`${label} hour, ${clockHour(hour)}`} />
              )}
            />
            <AnchoredMenu
              options={(["AM", "PM"] as const).map((p, i) => ({ key: i, label: p, disabled: !periodHasValidHour(p, bounds), disabledHint: orderHint }))}
              selected={period === "AM" ? 0 : 1}
              onPick={(i) => {
                const next = switchPeriod(hour, i === 0 ? "AM" : "PM", bounds);
                if (next !== hour) onChange(index, next);
              }}
              renderTrigger={({ open, onPress }) => <Dropdown value={period} open={open} onPress={onPress} accessibilityLabel={`${label}, ${period}`} />}
            />
          </View>
        );
      })}
    </View>
  );
}

function Dropdown({ value, open, onPress, accessibilityLabel }: { value: string; open: boolean; onPress: () => void; accessibilityLabel: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const chevron = useAnimatedStyle(() => ({
    transform: [{ rotate: withTiming(open ? "180deg" : "0deg", { duration: duration.base, easing: easeOut }) }],
  }));
  return (
    <PressableScale
      onPress={onPress}
      haptic="tick"
      scaleTo={0.95}
      style={[styles.dropdown, open && styles.dropdownOpen]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded: open }}
    >
      <Txt variant="callout" weight="600" tabular color={open ? colors.onAccent : colors.textPrimary}>
        {value}
      </Txt>
      <Animated.View style={chevron}>
        <Ionicons name="chevron-down" size={14} color={open ? colors.onAccent : colors.textSecondary} />
      </Animated.View>
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  divided: { borderTopWidth: 1, borderTopColor: t.colors.separator },
  row: { flexDirection: "row", alignItems: "center", gap: t.space.sm, minHeight: 56 },
  flex: { flex: 1 },
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minWidth: 68,
    paddingHorizontal: t.space.md - 4,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.colors.surfaceRaised,
  },
  dropdownOpen: { backgroundColor: t.colors.accent },
}));
