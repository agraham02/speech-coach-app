import { useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { PressableScale } from "../common/PressableScale";
import { Txt } from "../common/Txt";
import { clockHour, hoursInPeriod, periodOf, switchPeriod } from "../../domain/reminderSettings";
import { duration, easeOut } from "../../theme/motion";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

interface ReminderHoursProps {
  // One reminder hour (24-hour, local) per session of the daily goal.
  hours: number[];
  onChange: (index: number, hour: number) => void;
}

type Open = { index: number; kind: "hour" | "period" } | null;

const ROW_HEIGHT = 44;
const VISIBLE_ROWS = 5;

const layout = LinearTransition.duration(duration.base).easing(easeOut);

// A row per session with two dropdowns — the hour and AM/PM. Each opens a
// short column under the row (the hour column scrolls), one open at a time;
// picking closes it. Whole hours only: a practice nudge doesn't need minutes.
export function ReminderHours({ hours, onChange }: ReminderHoursProps) {
  const styles = useStyles();
  const [open, setOpen] = useState<Open>(null);
  const toggle = (index: number, kind: "hour" | "period") =>
    setOpen((o) => (o?.index === index && o.kind === kind ? null : { index, kind }));

  return (
    <View>
      {hours.map((hour, index) => {
        const label = hours.length > 1 ? `Session ${index + 1}` : "Time";
        const period = periodOf(hour);
        const others = hours.filter((_, i) => i !== index);
        const opened = open?.index === index ? open.kind : null;
        return (
          <Animated.View key={index} layout={layout} style={index > 0 && styles.divided}>
            <View style={styles.row}>
              <Txt variant="body" style={styles.flex}>
                {label}
              </Txt>
              <Dropdown
                value={String(clockHour(hour))}
                open={opened === "hour"}
                onPress={() => toggle(index, "hour")}
                accessibilityLabel={`${label} hour, ${clockHour(hour)}`}
              />
              <Dropdown value={period} open={opened === "period"} onPress={() => toggle(index, "period")} accessibilityLabel={`${label}, ${period}`} />
            </View>
            {opened === "hour" ? (
              <Column
                options={hoursInPeriod(period).map((h) => ({ key: h, label: String(clockHour(h)), suffix: period, disabled: others.includes(h) }))}
                selected={hour}
                scrolls
                onPick={(h) => {
                  onChange(index, h);
                  setOpen(null);
                }}
              />
            ) : null}
            {opened === "period" ? (
              <Column
                options={(["AM", "PM"] as const).map((p, i) => ({ key: i, label: p }))}
                selected={period === "AM" ? 0 : 1}
                onPick={(i) => {
                  const next = switchPeriod(hour, i === 0 ? "AM" : "PM");
                  if (next !== hour) onChange(index, next);
                  setOpen(null);
                }}
              />
            ) : null}
          </Animated.View>
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

interface ColumnOption {
  key: number;
  label: string;
  suffix?: string;
  // Another session already uses this hour — two at once would be one nudge.
  disabled?: boolean;
}

function Column({ options, selected, onPick, scrolls }: { options: ColumnOption[]; selected: number; onPick: (key: number) => void; scrolls?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const scroll = useRef<ScrollView>(null);
  const selectedIndex = Math.max(0, options.findIndex((o) => o.key === selected));
  const rows = options.map((option) => {
    const on = option.key === selected;
    return (
      <PressableScale
        key={option.key}
        onPress={() => onPick(option.key)}
        disabled={option.disabled}
        haptic="tick"
        scaleTo={0.98}
        style={[styles.option, on && styles.optionOn, option.disabled && styles.optionDisabled]}
        accessibilityRole="button"
        accessibilityLabel={option.suffix ? `${option.label} ${option.suffix}` : option.label}
        accessibilityHint={option.disabled ? "Another session already uses this hour" : undefined}
        accessibilityState={{ selected: on, disabled: option.disabled }}
      >
        <Txt variant="callout" weight={on ? "600" : "400"} tabular color={on ? colors.onAccent : colors.textPrimary} style={styles.flex}>
          {option.label}
          {option.suffix ? (
            <Txt variant="callout" color={on ? colors.onAccent : colors.textSecondary}>
              {` ${option.suffix}`}
            </Txt>
          ) : null}
        </Txt>
        {on ? <Ionicons name="checkmark" size={18} color={colors.onAccent} /> : null}
      </PressableScale>
    );
  });

  return (
    <Animated.View entering={FadeIn.duration(duration.base)} exiting={FadeOut.duration(duration.fast)} style={styles.column}>
      {scrolls && options.length > VISIBLE_ROWS ? (
        <ScrollView
          ref={scroll}
          style={{ maxHeight: ROW_HEIGHT * VISIBLE_ROWS + 4 }}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          // Open with the current pick in view, a row from the top.
          onLayout={() => scroll.current?.scrollTo({ y: Math.max(0, (selectedIndex - 1) * ROW_HEIGHT), animated: false })}
        >
          {rows}
        </ScrollView>
      ) : (
        rows
      )}
    </Animated.View>
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
  column: { backgroundColor: t.colors.surfaceRaised, borderRadius: 14, padding: 2, marginBottom: t.space.md },
  option: { flexDirection: "row", alignItems: "center", height: ROW_HEIGHT, paddingHorizontal: t.space.md, borderRadius: 12 },
  optionOn: { backgroundColor: t.colors.accent },
  optionDisabled: { opacity: 0.4 },
}));
