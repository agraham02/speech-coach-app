import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { dateFromISODate, isoDateFromDate, todayISODate } from "../../utils/dateUtils";
import { Txt } from "./Txt";
import { PrimaryButton } from "./PrimaryButton";

interface DatePickerProps {
  visible: boolean;
  // YYYY-MM-DD; today when null.
  value: string | null;
  onPick: (date: string) => void;
  onClose: () => void;
  title?: string;
  // Earliest pickable day (YYYY-MM-DD); today by default.
  minimumDate?: string;
  // Latest pickable day (YYYY-MM-DD); no limit by default.
  maximumDate?: string;
  // "spinner": month, day and year wheels, for far-off dates like a birthday.
  display?: "inline" | "spinner";
}

// A calendar for picking one day. Android opens its own dialog; iOS shows
// the inline calendar in a slide-up sheet (the FilterSheet pattern), with
// Done to confirm.
export function DatePicker({ visible, value, onPick, onClose, title = "Pick a date", minimumDate, maximumDate, display = "inline" }: DatePickerProps) {
  const min = dateFromISODate(minimumDate ?? todayISODate());
  const max = maximumDate ? dateFromISODate(maximumDate) : undefined;
  const start = value ? dateFromISODate(value) : max && max < min ? max : min;

  useEffect(() => {
    if (Platform.OS !== "android" || !visible) return;
    DateTimePickerAndroid.open({
      value: start,
      mode: "date",
      minimumDate: min,
      ...(max ? { maximumDate: max } : {}),
      onChange: (event, date) => {
        if (event.type === "set" && date) onPick(isoDateFromDate(date));
        onClose();
      },
    });
    // Opened once per show.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (Platform.OS === "android") return null;
  return <IosSheet visible={visible} start={start} min={min} max={max} display={display} title={title} onPick={onPick} onClose={onClose} />;
}

function IosSheet({ visible, start, min, max, display, title, onPick, onClose }: { visible: boolean; start: Date; min: Date; max?: Date; display: "inline" | "spinner"; title: string; onPick: (d: string) => void; onClose: () => void }) {
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);
  const [draft, setDraft] = useState(start);

  useEffect(() => {
    if (visible) setDraft(start);
    progress.value = withTiming(visible ? 1 : 0, { duration: 220 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.value) * 480 }] }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close the calendar" />
      </Animated.View>
      <Animated.View style={[styles.panel, { paddingBottom: insets.bottom + 16 }, panelStyle]}>
        <View style={styles.handle} />
        <Txt variant="title3">{title}</Txt>
        <DateTimePicker
          value={draft}
          mode="date"
          display={display}
          minimumDate={min}
          maximumDate={max}
          accentColor={colors.accent}
          themeVariant={scheme === "dark" ? "dark" : "light"}
          onValueChange={(_e, date) => date && setDraft(date)}
        />
        <PrimaryButton
          label="Done"
          onPress={() => {
            onPick(isoDateFromDate(draft));
            onClose();
          }}
        />
      </Animated.View>
    </Modal>
  );
}

// "Thu, Nov 6", plus the year when it isn't this one.
export function formatEventDate(date: string): string {
  const d = dateFromISODate(date);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

const useStyles = makeStyles((t) => ({
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.colors.overlayScrim },
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: t.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: t.space.lg,
    paddingTop: t.space.sm,
    gap: t.space.md,
  },
  handle: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: t.colors.switchTrackOff },
}));
