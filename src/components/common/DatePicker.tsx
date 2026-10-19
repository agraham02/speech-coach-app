import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
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
}

// A calendar for picking one day. Android opens its own dialog; iOS shows
// the inline calendar in a slide-up sheet (the FilterSheet pattern), with
// Done to confirm.
export function DatePicker({ visible, value, onPick, onClose, title = "Pick a date", minimumDate }: DatePickerProps) {
  const min = dateFromISODate(minimumDate ?? todayISODate());
  const start = value ? dateFromISODate(value) : min;

  useEffect(() => {
    if (Platform.OS !== "android" || !visible) return;
    DateTimePickerAndroid.open({
      value: start,
      mode: "date",
      minimumDate: min,
      onChange: (event, date) => {
        if (event.type === "set" && date) onPick(isoDateFromDate(date));
        onClose();
      },
    });
    // Opened once per show.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (Platform.OS === "android") return null;
  return <IosSheet visible={visible} start={start} min={min} title={title} onPick={onPick} onClose={onClose} />;
}

function IosSheet({ visible, start, min, title, onPick, onClose }: { visible: boolean; start: Date; min: Date; title: string; onPick: (d: string) => void; onClose: () => void }) {
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
          display="inline"
          minimumDate={min}
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

interface DateFieldProps {
  label: string;
  value: string | null;
  onChange: (date: string) => void;
  placeholder?: string;
}

// A row showing the chosen day ("Thu, Nov 6"); tap to change it.
export function DateField({ label, value, onChange, placeholder = "Pick a date" }: DateFieldProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.field} accessibilityRole="button" accessibilityLabel={`${label}: ${value ? formatEventDate(value) : "not set"}`}>
        <Ionicons name="calendar-clear-outline" size={18} color={colors.textSecondary} />
        <Txt variant="body" tone={value ? "primary" : "muted"} style={styles.fieldText}>
          {value ? formatEventDate(value) : placeholder}
        </Txt>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </Pressable>
      <DatePicker visible={open} value={value} onPick={onChange} onClose={() => setOpen(false)} title={label} />
    </>
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
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space.sm,
    minHeight: 48,
    paddingHorizontal: t.space.md,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceRaised,
  },
  fieldText: { flex: 1 },
}));
