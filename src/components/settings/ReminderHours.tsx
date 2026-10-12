import { useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { PressableScale } from "../common/PressableScale";
import { Txt } from "../common/Txt";
import { formatReminderHour, REMINDER_HOUR_MAX, REMINDER_HOUR_MIN } from "../../domain/reminderSettings";
import { duration, easeOut } from "../../theme/motion";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";

interface ReminderHoursProps {
  // One reminder hour (24-hour, local) per session of the daily goal.
  hours: number[];
  onChange: (index: number, hour: number) => void;
}

const COLUMNS = 6;

// The reminder hours, grouped the way people think about their day.
const PARTS = [
  { label: "Morning", from: REMINDER_HOUR_MIN, to: 11 },
  { label: "Afternoon", from: 12, to: 16 },
  { label: "Evening", from: 17, to: REMINDER_HOUR_MAX },
].map((part) => ({ label: part.label, hours: Array.from({ length: part.to - part.from + 1 }, (_, i) => part.from + i) }));

const layout = LinearTransition.duration(duration.base).easing(easeOut);

// A row per session showing its hour; tapping one opens an hour grid under
// it (one open at a time), and picking an hour closes it. Whole hours only —
// a slider made "5 PM" a fiddly drag, and a minute wheel asks for precision
// a practice nudge doesn't need.
export function ReminderHours({ hours, onChange }: ReminderHoursProps) {
  const styles = useStyles();
  const [open, setOpen] = useState<number | null>(null);

  return (
    <View>
      {hours.map((hour, index) => {
        const label = hours.length > 1 ? `Session ${index + 1}` : "Time";
        const others = hours.filter((_, i) => i !== index);
        return (
          <Animated.View key={index} layout={layout} style={index > 0 && styles.divided}>
            <HourRow label={label} hour={hour} open={open === index} onPress={() => setOpen(open === index ? null : index)} />
            {open === index ? (
              <Animated.View entering={FadeIn.duration(duration.base)} exiting={FadeOut.duration(duration.fast)} style={styles.grid}>
                {PARTS.map((part) => (
                  <View key={part.label} style={styles.part}>
                    <Txt variant="footnote" tone="secondary">
                      {part.label}
                    </Txt>
                    <View style={styles.chips}>
                      {part.hours.map((h) => (
                        <HourChip
                          key={h}
                          hour={h}
                          selected={h === hour}
                          // Two sessions at the same hour would be one nudge.
                          taken={others.includes(h)}
                          onPress={() => {
                            onChange(index, h);
                            setOpen(null);
                          }}
                        />
                      ))}
                      {/* Keep a short row's chips in the same columns. */}
                      {Array.from({ length: COLUMNS - part.hours.length }, (_, i) => (
                        <View key={`gap${i}`} style={styles.chipSlot} />
                      ))}
                    </View>
                  </View>
                ))}
              </Animated.View>
            ) : null}
          </Animated.View>
        );
      })}
    </View>
  );
}

function HourRow({ label, hour, open, onPress }: { label: string; hour: number; open: boolean; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const chevron = useAnimatedStyle(() => ({
    transform: [{ rotate: withTiming(open ? "180deg" : "0deg", { duration: duration.base, easing: easeOut }) }],
  }));
  return (
    <PressableScale
      onPress={onPress}
      haptic="tick"
      scaleTo={0.99}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`${label} reminder, ${formatReminderHour(hour)}`}
      accessibilityHint={open ? "Closes the hours" : "Shows the hours to choose from"}
      accessibilityState={{ expanded: open }}
    >
      <Txt variant="body" style={styles.flex}>
        {label}
      </Txt>
      <View style={[styles.value, open && styles.valueOpen]}>
        <Txt variant="callout" weight="600" tabular color={open ? colors.onAccent : colors.textPrimary}>
          {formatReminderHour(hour)}
        </Txt>
        <Animated.View style={chevron}>
          <Ionicons name="chevron-down" size={14} color={open ? colors.onAccent : colors.textSecondary} />
        </Animated.View>
      </View>
    </PressableScale>
  );
}

function HourChip({ hour, selected, taken, onPress }: { hour: number; selected: boolean; taken: boolean; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return (
    <PressableScale
      onPress={onPress}
      disabled={taken}
      haptic="tick"
      scaleTo={0.9}
      style={[styles.chipSlot, styles.chip, selected && styles.chipOn, taken && styles.chipTaken]}
      accessibilityRole="button"
      accessibilityLabel={formatReminderHour(hour)}
      accessibilityHint={taken ? "Another session already uses this hour" : undefined}
      accessibilityState={{ selected, disabled: taken }}
    >
      <Txt variant="callout" weight={selected ? "600" : "500"} tabular color={selected ? colors.onAccent : taken ? colors.textMuted : colors.textPrimary}>
        {display}
      </Txt>
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  divided: { borderTopWidth: 1, borderTopColor: t.colors.separator },
  row: { flexDirection: "row", alignItems: "center", gap: t.space.md, minHeight: 52 },
  flex: { flex: 1 },
  value: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: t.space.md,
    height: 34,
    borderRadius: 17,
    backgroundColor: t.colors.surfaceRaised,
  },
  valueOpen: { backgroundColor: t.colors.accent },
  grid: { gap: t.space.md, paddingBottom: t.space.md },
  part: { gap: t.space.xs + 2 },
  chips: { flexDirection: "row", gap: t.space.sm },
  chipSlot: { flex: 1, height: 40 },
  chip: { borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: t.colors.surfaceRaised },
  chipOn: { backgroundColor: t.colors.accent },
  chipTaken: { opacity: 0.45 },
}));
