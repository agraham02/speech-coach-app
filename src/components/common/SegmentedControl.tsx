import { useEffect, useRef, useState } from "react";
import { I18nManager, type LayoutChangeEvent, Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { makeStyles } from "../../theme/ThemeProvider";
import { duration, easeOut } from "../../theme/motion";
import { tick } from "../../utils/haptics";
import { indicatorTranslateX, segmentIndicator } from "../ui/inputLogic";
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

// A tinted track with a raised thumb that slides to the selected segment. The
// thumb is sized and placed from each segment's measured width, so it is right
// for any number of segments, at any text size, and in right-to-left. It eases
// (no bounce), and jumps when Reduce Motion is on.
export function SegmentedControl<T extends string>({ options, value, onChange, size = "md" }: SegmentedControlProps<T>) {
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const [widths, setWidths] = useState<(number | undefined)[]>([]);
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const placed = useRef(false);
  const activeIndex = Math.max(0, options.findIndex((o) => o.key === value));
  const indicator = segmentIndicator(widths, activeIndex);

  const targetX = indicator ? indicatorTranslateX(indicator, I18nManager.isRTL) : 0;
  const targetW = indicator?.width ?? 0;
  const ready = indicator != null;
  useEffect(() => {
    if (!ready) return;
    if (!placed.current || reduceMotion) {
      x.value = targetX;
      w.value = targetW;
      placed.current = true;
      return;
    }
    const timing = { duration: duration.base, easing: easeOut };
    x.value = withTiming(targetX, timing);
    w.value = withTiming(targetW, timing);
  }, [ready, targetX, targetW, reduceMotion, x, w]);

  const indicatorStyle = useAnimatedStyle(() => ({ width: w.value, transform: [{ translateX: x.value }] }));

  function measure(i: number, e: LayoutChangeEvent) {
    const width = e.nativeEvent.layout.width;
    setWidths((prev) => {
      if (prev[i] === width) return prev;
      const next = prev.slice();
      next[i] = width;
      return next;
    });
  }

  return (
    <View style={styles.track}>
      {ready ? <Animated.View pointerEvents="none" style={[styles.indicator, indicatorStyle]} /> : null}
      {options.map((option, i) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            style={[styles.segment, size === "sm" && styles.segmentSm]}
            onLayout={(e) => measure(i, e)}
            onPress={() => {
              if (!selected) tick();
              onChange(option.key);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Txt variant={size === "sm" ? "footnote" : "subhead"} weight={selected ? "600" : "500"} tone={selected ? "primary" : "secondary"} numberOfLines={1}>
              {option.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const TRACK_PADDING = 3;

const useStyles = makeStyles((t) => ({
  track: {
    flexDirection: "row",
    backgroundColor: t.colors.accentMuted,
    borderRadius: 12,
    padding: TRACK_PADDING,
  },
  // Pinned to the start edge (inside the padding); translateX slides it.
  indicator: {
    position: "absolute",
    top: TRACK_PADDING,
    bottom: TRACK_PADDING,
    start: TRACK_PADDING,
    backgroundColor: t.scheme === "dark" ? "rgba(255,250,235,0.14)" : t.colors.surface,
    borderRadius: 9,
    ...(t.scheme === "dark" ? null : { shadowColor: "#1C190F", shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 }),
  },
  segment: { flex: 1, minHeight: 36, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
  segmentSm: { minHeight: 30 },
}));
