import { useEffect } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Txt } from "../common/Txt";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radii, spacing } from "../../theme/theme";
import { makeStyles } from "../../theme/ThemeProvider";

interface FilterOption {
  key: string;
  label: string;
}

interface FilterSheetProps {
  visible: boolean;
  onClose: () => void;
  // Impromptu, Rewind and so on. Empty hides the section (one type only).
  kindOptions: FilterOption[];
  kindValue: string;
  onKindChange: (value: string) => void;
  dateOptions: FilterOption[];
  dateValue: string;
  onDateChange: (value: string) => void;
  statusOptions: FilterOption[];
  statusValue: string;
  onStatusChange: (value: string) => void;
  categoryOptions: string[]; // "all" plus every distinct category, "All Topics" label derived for "all"
  categoryValue: string;
  onCategoryChange: (value: string) => void;
  durationOptions: FilterOption[];
  durationValue: string;
  onDurationChange: (value: string) => void;
  onReset: () => void;
}

// A hand-rolled slide-up sheet (RN's Modal for portal/back-button handling,
// Reanimated for the actual motion) — holds the Type, When, Show, Topic and
// Length filters, keeping the Library itself down to a search box and the
// list.
export function FilterSheet({
  visible,
  onClose,
  kindOptions,
  kindValue,
  onKindChange,
  dateOptions,
  dateValue,
  onDateChange,
  statusOptions,
  statusValue,
  onStatusChange,
  categoryOptions,
  categoryValue,
  onCategoryChange,
  durationOptions,
  durationValue,
  onDurationChange,
  onReset,
}: FilterSheetProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, { duration: 220 });
  }, [visible, progress]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.value) * 520 }] }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close filters"
        />
      </Animated.View>

      <Animated.View style={[styles.panel, { paddingBottom: insets.bottom + spacing.lg }, panelStyle]}>
        <View style={styles.handle} />
        <View style={styles.panelHeader}>
          <Txt variant="title2" style={styles.panelTitle}>Filters</Txt>
          <Pressable onPress={onReset} hitSlop={12} accessibilityRole="button" accessibilityLabel="Reset filters">
            <Txt variant="callout" weight="600" style={styles.resetText}>Reset</Txt>
          </Pressable>
        </View>

        {kindOptions.length ? (
          <>
            <Txt variant="footnote" weight="600" style={styles.sectionLabel}>Type</Txt>
            <ChipRow options={kindOptions} value={kindValue} onChange={onKindChange} labelPrefix="Show" />
          </>
        ) : null}

        <Txt variant="footnote" weight="600" style={[styles.sectionLabel, kindOptions.length ? styles.sectionSpacer : null]}>When</Txt>
        <ChipRow options={dateOptions} value={dateValue} onChange={onDateChange} labelPrefix="Recorded" />

        <Txt variant="footnote" weight="600" style={[styles.sectionLabel, styles.sectionSpacer]}>Show</Txt>
        <ChipRow options={statusOptions} value={statusValue} onChange={onStatusChange} labelPrefix="Show" />

        <Txt variant="footnote" weight="600" style={[styles.sectionLabel, styles.sectionSpacer]}>Topic</Txt>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRowScroll}>
          {categoryOptions.map((category) => {
            const selected = categoryValue === category;
            const label = category === "all" ? "All Topics" : category;
            return (
              <Pressable
                key={category}
                onPress={() => onCategoryChange(category)}
                style={[styles.chip, selected && styles.chipSelected]}
                accessibilityRole="button"
                accessibilityLabel={`Filter by ${label}`}
                accessibilityState={{ selected }}
              >
                <Txt variant="footnote" weight="600" style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Txt>
              </Pressable>
            );
          })}
        </ScrollView>

        <Txt variant="footnote" weight="600" style={[styles.sectionLabel, styles.sectionSpacer]}>Length</Txt>
        <ChipRow options={durationOptions} value={durationValue} onChange={onDurationChange} labelPrefix="Filter by" />

        <Pressable style={styles.doneButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="Apply filters">
          <Txt variant="headline" style={styles.doneButtonText}>Done</Txt>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

function ChipRow({ options, value, onChange, labelPrefix }: { options: FilterOption[]; value: string; onChange: (value: string) => void; labelPrefix: string }) {
  const styles = useStyles();
  return (
    <View style={styles.chipRowWrap}>
      {options.map((option) => {
        const selected = value === option.key;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            style={[styles.chip, selected && styles.chipSelected]}
            accessibilityRole="button"
            accessibilityLabel={`${labelPrefix} ${option.label}`}
            accessibilityState={{ selected }}
          >
            <Txt variant="footnote" weight="600" style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlayScrim },
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  handle: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: colors.switchTrackOff, marginBottom: spacing.sm },
  panelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  panelTitle: { color: colors.textPrimary },
  resetText: { color: colors.accent },
  sectionLabel: { color: colors.textMuted },
  sectionSpacer: { marginTop: spacing.sm },
  chipRowScroll: { flexDirection: "row", gap: spacing.xs, paddingVertical: spacing.xs },
  chipRowWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, paddingVertical: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.surfaceRaised,
  },
  chipSelected: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  chipText: { color: colors.textSecondary },
  chipTextSelected: { color: colors.accent },
  doneButton: {
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  doneButtonText: { color: colors.onAccent },
}));
