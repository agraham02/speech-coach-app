import { useEffect, useState } from "react";
import { type LayoutChangeEvent, Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { makeStyles } from "../../theme/ThemeProvider";
import { spring } from "../../theme/motion";
import { tick } from "../../utils/haptics";
import { Txt } from "./Txt";

interface SegmentOption<T extends string> {
  key: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "md" | "sm";
}

const TRACK_PADDING = 3;

// A pill track with a thumb that springs to the selected segment.
export function SegmentedControl<T extends string>({ options, value, onChange, size = "md" }: SegmentedControlProps<T>) {
  const styles = useStyles();
  const [trackWidth, setTrackWidth] = useState(0);
  const indicatorX = useSharedValue(0);
  const activeIndex = Math.max(0, options.findIndex((o) => o.key === value));
  const segmentWidth = trackWidth > 0 ? (trackWidth - TRACK_PADDING * 2) / options.length : 0;

  useEffect(() => {
    if (segmentWidth > 0) indicatorX.value = withSpring(activeIndex * segmentWidth, spring.gentle);
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
            style={[styles.segment, size === "sm" && styles.segmentSm]}
            onPress={() => {
              if (!selected) tick();
              onChange(option.key);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Txt variant={size === "sm" ? "footnote" : "subhead"} weight={selected ? "600" : "500"} tone={selected ? "primary" : "muted"} numberOfLines={1}>
              {option.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  track: {
    flexDirection: "row",
    backgroundColor: t.colors.surfaceRaised,
    borderRadius: t.radius.pill,
    padding: TRACK_PADDING,
  },
  indicator: {
    position: "absolute",
    top: TRACK_PADDING,
    bottom: TRACK_PADDING,
    left: TRACK_PADDING,
    backgroundColor: t.scheme === "dark" ? "rgba(255,250,235,0.14)" : t.colors.surface,
    borderRadius: t.radius.pill,
    ...t.shadow.card,
  },
  segment: { flex: 1, paddingVertical: 9, alignItems: "center", justifyContent: "center" },
  segmentSm: { paddingVertical: 6 },
}));
