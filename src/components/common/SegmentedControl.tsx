import { useEffect, useState } from "react";
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { colors, radii, spacing, typography } from "../../theme/theme";

interface SegmentOption<T extends string> {
  key: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

const TRACK_PADDING = 3;

// A hand-rolled tab row with a sliding indicator — matches the codebase's
// preference for small Reanimated-based UI over pulling in a tab-bar
// dependency (see ToastProvider.tsx, StepList.tsx).
export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  const [trackWidth, setTrackWidth] = useState(0);
  const indicatorX = useSharedValue(0);
  const activeIndex = Math.max(0, options.findIndex((o) => o.key === value));
  const segmentWidth = trackWidth > 0 ? (trackWidth - TRACK_PADDING * 2) / options.length : 0;

  useEffect(() => {
    if (segmentWidth > 0) {
      indicatorX.value = withTiming(activeIndex * segmentWidth, { duration: 220 });
    }
  }, [activeIndex, segmentWidth, indicatorX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: segmentWidth,
  }));

  return (
    <View style={styles.track} onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}>
      {segmentWidth > 0 ? <Animated.View style={[styles.indicator, indicatorStyle]} /> : null}
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            style={styles.segment}
            onPress={() => onChange(option.key)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: TRACK_PADDING,
  },
  indicator: {
    position: "absolute",
    top: TRACK_PADDING,
    bottom: TRACK_PADDING,
    left: TRACK_PADDING,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.md - TRACK_PADDING,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segment: { flex: 1, paddingVertical: spacing.sm, alignItems: "center", justifyContent: "center" },
  label: { color: colors.textMuted, fontSize: typography.caption, fontWeight: "700" },
  labelSelected: { color: colors.textPrimary },
});
