import { useEffect } from "react";
import { ScrollView, View } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { makeStyles, useTheme } from "../../theme/ThemeProvider";
import { duration } from "../../theme/motion";
import { PressableScale } from "./PressableScale";
import { Txt } from "./Txt";

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
  background?: string;
  // A small colored dot before the label (skills, categories).
  dot?: string;
  // A stable handle for automated testing.
  testID?: string;
}

// A pill. Selected is ink; the fill eases between states.
export function Chip({ label, selected, onPress, color, background, dot, testID }: ChipProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const on = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    on.value = withTiming(selected ? 1 : 0, { duration: duration.fast });
  }, [selected, on]);
  const bgFrom = background ?? colors.surfaceRaised;
  const fill = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(on.value, [0, 1], [bgFrom, colors.accent]) }));
  const fg = selected ? colors.onAccent : color ?? colors.textSecondary;
  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      haptic={onPress ? "tick" : undefined}
      scaleTo={0.95}
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityState={{ selected }}
      testID={testID}
    >
      <Animated.View style={[styles.chip, fill]}>
        {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
        <Txt variant="footnote" weight={selected ? "600" : "500"} color={fg}>
          {label}
        </Txt>
      </Animated.View>
    </PressableScale>
  );
}

export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  scroll,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  scroll?: boolean;
}) {
  const styles = useStyles();
  const chips = options.map((o) => <Chip key={o.key} label={o.label} selected={o.key === value} onPress={() => onChange(o.key)} />);
  if (scroll) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroller} contentContainerStyle={[styles.group, styles.bleedContent]}>
        {chips}
      </ScrollView>
    );
  }
  return <View style={[styles.group, styles.wrap]}>{chips}</View>;
}

const useStyles = makeStyles((t) => ({
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: t.radius.pill },
  dot: { width: 7, height: 7, borderRadius: 4 },
  group: { flexDirection: "row", gap: t.space.sm },
  // Keeps a horizontal row from shrinking to a sliver inside a flex column,
  // and runs it to the screen edges so chips scroll under the gutter (a
  // scrolling row is always at screen level).
  scroller: { flexGrow: 0, flexShrink: 0, marginHorizontal: -t.layout.gutter },
  bleedContent: { paddingHorizontal: t.layout.gutter },
  wrap: { flexWrap: "wrap" },
}));
