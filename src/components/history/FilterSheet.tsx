import { useEffect } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radii, spacing, typography } from "../../theme/theme";
import { makeStyles } from "../../theme/ThemeProvider";

interface FilterOption {
  key: string;
  label: string;
}

interface FilterSheetProps {
  visible: boolean;
  onClose: () => void;
  categoryOptions: string[]; // "all" plus every distinct category, "All Topics" label derived for "all"
  categoryValue: string;
  onCategoryChange: (value: string) => void;
  durationOptions: FilterOption[];
  durationValue: string;
  onDurationChange: (value: string) => void;
  onReset: () => void;
}

// A hand-rolled slide-up sheet (RN's Modal for portal/back-button handling,
// Reanimated for the actual motion) — holds the Topic and Duration filters
// that used to sit as two permanent chip rows on History, freeing that
// screen up when there's little to filter yet. Status stays as its own
// always-visible row on History since it's the one people reach for most.
export function FilterSheet({
  visible,
  onClose,
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
  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.value) * 280 }] }));

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
          <Text style={styles.panelTitle}>Filters</Text>
          <Pressable onPress={onReset} hitSlop={12} accessibilityRole="button" accessibilityLabel="Reset filters">
            <Text style={styles.resetText}>Reset</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>TOPIC</Text>
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
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={[styles.sectionLabel, styles.sectionSpacer]}>LENGTH</Text>
        <View style={styles.chipRowWrap}>
          {durationOptions.map((option) => {
            const selected = durationValue === option.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => onDurationChange(option.key)}
                style={[styles.chip, selected && styles.chipSelected]}
                accessibilityRole="button"
                accessibilityLabel={`Filter by ${option.label}`}
                accessibilityState={{ selected }}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable style={styles.doneButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="Apply filters">
          <Text style={styles.doneButtonText}>Done</Text>
        </Pressable>
      </Animated.View>
    </Modal>
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
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  handle: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.xs },
  panelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  panelTitle: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "700" },
  resetText: { color: colors.accent, fontSize: typography.body, fontWeight: "600" },
  sectionLabel: { color: colors.textMuted, fontSize: typography.caption - 1, fontWeight: "700", letterSpacing: 1 },
  sectionSpacer: { marginTop: spacing.sm },
  chipRowScroll: { flexDirection: "row", gap: spacing.xs, paddingVertical: spacing.xs },
  chipRowWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, paddingVertical: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  chipText: { color: colors.textSecondary, fontSize: typography.caption, fontWeight: "600" },
  chipTextSelected: { color: colors.accent },
  doneButton: {
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  doneButtonText: { color: colors.onAccent, fontSize: typography.bodyLarge, fontWeight: "600" },
}));
